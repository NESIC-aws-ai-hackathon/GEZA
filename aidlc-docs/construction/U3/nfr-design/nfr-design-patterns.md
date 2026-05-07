# U3 NFR 設計パターン
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-07  
> 対象ユニット: U3（リハーサルモード）  
> ステータス: 承認待ち

---

## 1. 同期 API 呼び出しパターン（evaluate-apology / text-to-speech / generate-feedback）

U3 の全 Lambda は同期呼び出し（SQS 非同期不使用）。  
会話リアルタイム性を維持するため、evaluate-apology は AbortController でタイムアウト制御する。

### evaluate-apology 呼び出しパターン

```javascript
// practice.js 内
async function callEvaluateApology(apologyText) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9500); // 9.5s（10s タイムアウトの手前）

  try {
    const token = await AuthModule.getIdToken();
    const res = await fetch(`${GEZA_CONFIG.API_BASE}/apology/evaluate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apology_text: apologyText,
        opponent_profile: state.opponentProfile,
        conversation_history: state.conversationHistory.slice(-10), // 直近10ターン
        session_id: state.sessionId,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new ApiError(res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    throw e; // フォールバック処理へ
  }
}
```

### text-to-speech 呼び出しパターン

```javascript
async function callTTS(text) {
  const voiceId = state.opponentProfile.gender === 'male' ? 'Takumi' : 'Kazuha';
  const token = await AuthModule.getIdToken();
  const res = await fetch(`${GEZA_CONFIG.API_BASE}/tts/synthesize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
  });
  if (!res.ok) throw new ApiError(res.status);
  return await res.json(); // { audio_base64, visemes }
}
```

---

## 2. フォールバックパターン（US-408）

```
consecutiveErrors = 0 で初期化

evaluate-apology 失敗時:
  if (consecutiveErrors < 2):
    // 1回目: 固定フォールバック返答（練習を止めない）
    display fallback:
      response_text = "少し考えさせてください…"
      emotion_label = "confusion"
      anger_level / trust_level = 前ターン値（変化なし）
    consecutiveErrors += 1
  else:
    // 2回目以上: エラー通知 + UI ロック
    showErrorBanner("通信エラーが発生しています。少し時間をおいてから再試行してください")
    disableInputArea()
    showRetryButton(() => {
      consecutiveErrors = 0
      enableInputArea()
    })

成功時:
  consecutiveErrors = 0  // リセット
```

---

## 3. Polly 音声再生 + UI ロックパターン（Q3: B）

再生中は送信ボタンとマイクボタンを disabled にして「ボスが話している」演出を維持する。

```javascript
// PollySyncController.playWithSync() の前後で UI 制御
async function playbossResponse(audioBase64, visemes) {
  // 1. UI ロック
  setInputEnabled(false);   // 送信ボタン・マイクボタン disabled
  AvatarController.setHeadMotion('speakingNod');

  // 2. 音声 + Viseme 再生
  await PollySyncController.playWithSync(audioBase64, visemes);

  // 3. UI アンロック
  AvatarController.setHeadMotion('headIdle');
  setInputEnabled(true);
}
```

---

## 4. Transcribe Streaming パターン（US-403）

### 接続フロー

```
[UserGesture: マイクボタン押下]
  │
  ├─ MediaDevices.getUserMedia({ audio: true })
  │     - 権限拒否 → エラーメッセージ表示（テキスト入力は引き続き利用可能）
  │
  ├─ Cognito Identity Pool で一時認証情報を取得
  │     aws cognito-identity:GetId + GetCredentialsForIdentity
  │     → { accessKeyId, secretAccessKey, sessionToken }
  │
  ├─ SigV4 署名 WebSocket URL を生成
  │     endpoint: wss://transcribestreaming.ap-northeast-1.amazonaws.com/stream-transcription-websocket
  │     params: language-code=ja-JP & media-encoding=pcm & sample-rate=16000
  │
  ├─ WebSocket 接続開始
  │
  ├─ AudioContext（16kHz PCM）でマイク音声をキャプチャ
  │     - Chrome: MediaRecorder + audio/webm → PCM 変換
  │     - Safari: MediaRecorder が audio/mp4 のみ → AudioContext.createScriptProcessor() で PCM 取得
  │
  ├─ PCM チャンクを event-stream フォーマットで WebSocket に送信（32ms 間隔）
  │
  ├─ Transcribe からの TranscriptEvent を受信
  │     - IsPartial=true: テキスト入力欄を暫定テキストで更新
  │     - IsPartial=false: final transcript 確定 → テキスト入力欄に設定
  │
  ├─ 無音検出（3秒）or 送信ボタン押下 → stopStreaming()
  │     WebSocket に EndAudioEvent 送信 → 接続クローズ
  │
  └─ final transcript で evaluate-apology を呼び出し（UC-02 と同一フロー）
```

### 無音検出実装

```javascript
// ScriptProcessor で RMS を計算し 3 秒間閾値以下なら停止
const SILENCE_THRESHOLD = 0.01;   // RMS 閾値
const SILENCE_DURATION_MS = 3000; // 3秒

let silenceStart = null;

function checkSilence(rms) {
  if (rms < SILENCE_THRESHOLD) {
    if (!silenceStart) silenceStart = Date.now();
    else if (Date.now() - silenceStart >= SILENCE_DURATION_MS) {
      transcribeClient.stop(); // 自動停止
    }
  } else {
    silenceStart = null; // 発話検出でリセット
  }
}
```

---

## 5. アバター感情表現パターン（US-401）

evaluate-apology の `emotion_label`（15カテゴリ ID）を受け取ったら AvatarController の setCategoryEmotion() を呼び出す。

```javascript
// カテゴリ ID で感情切り替え（AvatarController は U0/U1 実装済み）
AvatarController.setCategoryEmotion(evalResult.emotion_label);
// → カテゴリ内の感情をランダム選択 → 2〜4秒ごとに遷移

// 強い感情（rage / fierce_anger）でスクリーンエフェクト
if (['fierce_anger', 'anger'].includes(evalResult.emotion_label)) {
  screenShake('medium');
  if (evalResult.anger_level >= 90) screenShake('large');
}
if (evalResult.emotion_label === 'forgiveness') {
  flashOverlay('white', 300);
}
```

---

## 6. クリア判定パターン（US-401 AC-5）

```javascript
function checkClearCondition(angryScore, trustScore) {
  if (trustScore >= 80 && angryScore <= 20) {
    state.sessionResult = 'clear';
    showClearOverlay();              // クリア演出オーバーレイ表示
    flashOverlay('gold', 500);       // 黄金フラッシュ
    setTimeout(() => goToFeedback(), 2000);
  }
}
```

---

## 7. DynamoDB アクセスパターン（U3 固有なし）

U3 では DynamoDB への直接書き込みは行わない。  
会話履歴はフロントエンドメモリのみで管理（Q10: A）。  
フィードバックデータは `sessionStorage["practiceResult"]` を経由して feedback.html に引き渡す。

> **U4 でのデータ永続化**: U4（謝罪後支援 + カルテ）フェーズで save-session Lambda を使って練習セッションを DynamoDB に保存する予定。U3 では実装不要。

---

## 8. セキュリティ設計

### XSS 防止（XSS-01）

```javascript
// AI 生成テキストを DOM に挿入する場合は必ず textContent を使用
chatBubble.textContent = evalResult.response_text;      // ✅
chatBubble.innerHTML  = evalResult.response_text;        // ❌ 禁止

// Transcribe 文字起こし結果も同様
inputEl.value = transcript; // value への設定は安全
interimEl.textContent = interimText; // ✅
```

### 音声データプライバシー

- Transcribe 音声ストリームはブラウザから直接 Transcribe へ送信（Lambda を経由しない）
- サーバーサイドに音声データは一切保存しない
- Polly TTS 結果（MP3 Base64）は `URL.createObjectURL` で一時的に Blob URL を生成し、再生後に `URL.revokeObjectURL` で破棄する
