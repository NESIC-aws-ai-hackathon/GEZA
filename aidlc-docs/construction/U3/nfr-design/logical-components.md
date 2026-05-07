# U3 論理コンポーネント設計
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-07  
> 対象ユニット: U3（リハーサルモード）  
> ステータス: 承認待ち

---

## コンポーネント一覧

| コンポーネント | 種別 | 役割 | 実装ファイル |
|-------------|:----:|------|------------|
| PracticePageController | 新規 | 練習画面全体制御・APIオーケストレーション | `frontend/pages/practice.js` |
| FeedbackPageController | 新規 | フィードバック画面制御 | `frontend/pages/feedback.js` |
| TranscribeClient | 新規 | Transcribe Streaming WebSocket クライアント | `frontend/shared/transcribe.js` |
| PollySyncController | 新規 | Polly MP3 再生 + Viseme 同期 | `frontend/shared/polly-sync.js` |
| AvatarController（U0/U1） | 継承 | setCategoryEmotion / setHeadMotion / setMouthViseme | `frontend/shared/avatar.js` |
| AuthModule（U0/U1） | 継承 | requireAuth / getIdToken / getCognitoIdentityCredentials（追加） | `frontend/shared/auth.js` |
| ApiClient（U0） | 継承 | post / get（既存）| `frontend/shared/api.js` |
| StateManager（U0） | 継承・拡張 | practice ネームスペース追加 | `frontend/shared/state.js` |
| EmotionDefinitions（U0） | 継承 | getCategoryById / pickRandomInCategory | `frontend/shared/emotions.js` |

---

## コンポーネント詳細

### PracticePageController（新規）

**責務**: 練習セッション全体のライフサイクル管理

```
PracticePageController
├─ async init()
│   ├─ AuthModule.requireAuth()              ← 未認証 → index.html
│   ├─ _loadOpponentFromStorage()            ← sessionStorage から opponentProfile / apologyPlan 読み取り
│   │   └─ 存在しない場合: エラーメッセージ + inception.html へのリンクを表示して処理停止
│   ├─ AvatarController.init('practice-avatar-container', opponentProfile.faceConfig)
│   ├─ PollySyncController.init(AvatarController)
│   ├─ _initState()                          ← PracticeState 初期化
│   └─ _renderInitialUI()                    ← ゲージ・台本カード表示 + 「練習を始める」ボタン表示
│
├─ async _handleStart()                      ← 「練習を始める」ボタン押下
│   ├─ 「練習を始める」ボタンを非表示
│   ├─ callTTS(opponentProfile.first_message) → PollySyncController.playWithSync()
│   └─ setInputEnabled(true)                 ← 入力エリア活性化
│
├─ async _handleTextSubmit()                 ← テキスト送信
│   ├─ バリデーション（空文字 → 送信不可）
│   ├─ _appendChatMessage('user', text)
│   ├─ setInputEnabled(false)
│   ├─ AvatarController.setCategoryEmotion('confusion') ← ローディング演出
│   ├─ evalResult = await callEvaluateApology(text)
│   ├─ _updateUIAfterEval(evalResult)
│   └─ await _playBossResponse(evalResult.response_text)
│
├─ async _toggleMic()                        ← マイクボタン押下
│   ├─ 録音中でない場合: TranscribeClient.startStreaming(onTranscript)
│   └─ 録音中の場合: TranscribeClient.stop() → final transcript で _handleTextSubmit()
│
├─ _updateUIAfterEval(evalResult)
│   ├─ AvatarController.setCategoryEmotion(evalResult.emotion_label)
│   ├─ _animateGauge(evalResult.anger_level, evalResult.trust_level)
│   ├─ _appendChatMessage('assistant', evalResult.response_text)
│   ├─ _renderNgWords(evalResult.ng_words)
│   ├─ evalResult.follow_up_question && _appendFollowUpQuestion()
│   ├─ _checkClear(evalResult.trust_level, evalResult.anger_level)
│   └─ _checkMaxTurns()
│
├─ async _playBossResponse(text)
│   ├─ ttsResult = await callTTS(text)
│   ├─ PollySyncController.playWithSync(ttsResult.audio_base64, ttsResult.visemes)
│   └─ setInputEnabled(true)                 ← 再生完了後にアンロック
│
├─ _checkClear(trustScore, angryScore)
│   ├─ if trustScore >= 80 && angryScore <= 20:
│   │   ├─ sessionResult = 'clear'
│   │   └─ _showClearAndGoFeedback()
│   └─ （未達: 継続）
│
├─ _checkMaxTurns()
│   └─ if turnCount >= 10: _showMaxTurnsBannerAndGoFeedback()
│
├─ _applyFallback(error)                     ← フォールバック処理（UC-07）
│   ├─ consecutiveErrors < 2: 固定返答表示 + consecutiveErrors++
│   └─ consecutiveErrors >= 2: エラーバナー + 送信 disabled + 「もう一度試す」ボタン
│
└─ _endSession(result)
    ├─ FeedbackData を sessionStorage["practiceResult"] に保存
    └─ location.href = 'feedback.html'
```

---

### FeedbackPageController（新規）

**責務**: フィードバック画面の初期化・generate-feedback API 呼び出し・結果表示

```
FeedbackPageController
├─ async init()
│   ├─ AuthModule.requireAuth()
│   ├─ practiceResult = sessionStorage["practiceResult"] 読み取り
│   │   └─ 存在しない場合: practice.html へリダイレクト
│   ├─ _renderScoreSummary(practiceResult)    ← スコアサマリー即時表示
│   └─ _loadFeedback(practiceResult)          ← generate-feedback を自動呼び出し（Q5: A）
│
├─ _renderScoreSummary(data)
│   ├─ 最終怒り度 / 信頼度 / ターン数 / NG ワード累計を textContent で表示
│   └─ セッション結果（クリア / 任意終了）を表示
│
├─ async _loadFeedback(data)
│   ├─ ローディングスピナー表示
│   ├─ feedbackResult = await callGenerateFeedback(data)
│   ├─ _renderProblems(feedbackResult.problems)
│   ├─ _renderImprovedApology(feedbackResult.improved_apology_text)
│   └─ _renderOverallComment(feedbackResult.overall_comment)
│
└─ _handleRetry()
    ├─ sessionStorage.removeItem("practiceResult")
    └─ location.href = 'practice.html'
```

---

### TranscribeClient（新規）

**責務**: Transcribe Streaming WebSocket の接続管理・音声キャプチャ・文字起こし

```
TranscribeClient
├─ async startStreaming(onTranscript)
│   ├─ 1. getUserMedia({ audio: true })
│   ├─ 2. AuthModule.getCognitoIdentityCredentials() → { accessKeyId, secretAccessKey, sessionToken }
│   ├─ 3. SigV4 署名 WebSocket URL を生成
│   │     endpoint: wss://transcribestreaming.ap-northeast-1.amazonaws.com/stream-transcription-websocket
│   │     params: language-code=ja-JP & media-encoding=pcm & sample-rate=16000
│   ├─ 4. WebSocket 接続
│   ├─ 5. AudioContext で PCM キャプチャ開始（Chrome: MediaRecorder / Safari: ScriptProcessorNode）
│   ├─ 6. PCM チャンクを EventStream フォーマットで WebSocket 送信（32ms 間隔）
│   ├─ 7. TranscriptEvent 受信: onTranscript(text, isPartial) を呼び出し
│   └─ 8. 無音検出（RMS < 0.01 が 3秒以上）→ stop() を自動呼び出し
│
├─ stop()
│   ├─ EndAudioEvent を WebSocket に送信
│   ├─ WebSocket クローズ
│   ├─ AudioContext / MediaStream をクリーンアップ
│   └─ マイクボタンを「録音停止」UI に変更
│
└─ _buildEventStreamMessage(pcmChunk)      ← PCM → EventStream バイナリエンコード
```

---

### PollySyncController（新規）

**責務**: Polly MP3 音声の再生と Viseme タイムコードに基づく口パク同期

```
PollySyncController
├─ init(avatarController)                  ← AvatarController への参照を保持
│
├─ async playWithSync(audioBase64, visemes)
│   ├─ 1. audioBase64 → Blob → URL.createObjectURL() → Audio 要素にセット
│   ├─ 2. visemes の setTimeout タイマーを全て登録:
│   │     visemes.forEach(v => {
│   │       setTimeout(() => avatarCtrl.setMouthViseme(v.value), v.time)
│   │     })
│   ├─ 3. audio.play()（ユーザーインタラクション後なので autoplay 許可）
│   ├─ 4. audio.onended: 口を 'sil' に戻す + URL.revokeObjectURL()
│   └─ 5. resolve（再生完了で Promise resolve）
│
└─ stop()
    ├─ audio.pause() + audio.currentTime = 0
    ├─ 全 setTimeout タイマーをクリア
    ├─ AvatarController.setMouthViseme('sil')
    └─ URL.revokeObjectURL()
```

---

### AuthModule 拡張（getCognitoIdentityCredentials 追加）

U3 では Transcribe Streaming 用に Cognito Identity Pool から一時認証情報を取得する必要がある。  
既存の `auth.js` に以下を追加：

```javascript
/**
 * Cognito Identity Pool から Transcribe 用の一時認証情報を取得する。
 * @returns {Promise<{accessKeyId: string, secretAccessKey: string, sessionToken: string}>}
 */
async getCognitoIdentityCredentials()
```

**フロー**:
1. `GetId` API（`cognito-identity.amazonaws.com`）で `identityId` を取得
2. `GetCredentialsForIdentity` API で `{ accessKeyId, secretAccessKey, sessionToken }` を取得  
   ※ Logins に `cognito-idp.ap-northeast-1.amazonaws.com/<UserPoolId>` と現在の `idToken` を渡す
3. 取得した認証情報を返却（有効期限 1時間。期限切れは再呼び出しで対応）

---

### StateManager 拡張（practice ネームスペース）

`state.js` に以下のネームスペースを追加：

```javascript
StateManager.practice = {
  opponentProfile: null,     // sessionStorage から読み込み
  apologyPlan: null,         // sessionStorage から読み込み（台本表示用）
  conversationHistory: [],   // ConversationTurn[]（フロントエンドメモリ管理）
  currentAngryScore: 0,      // opponentProfile.anger_level で初期化
  currentTrustScore: 0,      // opponentProfile.trust_level で初期化
  turnCount: 0,
  consecutiveErrors: 0,
  sessionResult: null,       // null | "clear" | "give_up"
  sessionId: null,           // crypto.randomUUID()
}
```

---

## 依存関係ツリー

```
practice.html
└─ practice.js（PracticePageController）
    ├─ shared/auth.js（AuthModule）← getCognitoIdentityCredentials 追加
    ├─ shared/api.js（ApiClient）
    ├─ shared/state.js（StateManager） ← practice ネームスペース追加
    ├─ shared/avatar.js（AvatarController）
    ├─ shared/emotions.js（EmotionDefinitions）
    ├─ shared/transcribe.js（TranscribeClient）← 新規
    └─ shared/polly-sync.js（PollySyncController）← 新規

feedback.html
└─ feedback.js（FeedbackPageController）
    ├─ shared/auth.js（AuthModule）
    └─ shared/api.js（ApiClient）
```

---

## U2→U3 変更サマリー

| ファイル | 変更種別 | 内容 |
|---------|:-------:|------|
| `frontend/shared/auth.js` | **更新** | `getCognitoIdentityCredentials()` メソッドを追加 |
| `frontend/shared/state.js` | **更新** | `practice` ネームスペースを追加 |
| `frontend/shared/transcribe.js` | **新規** | TranscribeClient 実装 |
| `frontend/shared/polly-sync.js` | **新規** | PollySyncController 実装 |
| `frontend/pages/practice.html` | **新規** | 練習画面 HTML |
| `frontend/pages/practice.js` | **新規** | PracticePageController 実装 |
| `frontend/pages/feedback.html` | **新規** | フィードバック画面 HTML |
| `frontend/pages/feedback.js` | **新規** | FeedbackPageController 実装 |
| `backend/functions/evaluate-apology/lambda_function.py` | **実装** | スタブ → 本実装（Nova Lite） |
| `backend/functions/text-to-speech/lambda_function.py` | **実装** | スタブ → 本実装（Polly） |
| `backend/functions/generate-feedback/lambda_function.py` | **実装** | スタブ → 本実装（Sonnet） |
| `template.yaml` | **更新** | GezaIdentityPool / GezaAuthenticatedRole / GezaIdentityPoolRoleAttachment を追加 |
