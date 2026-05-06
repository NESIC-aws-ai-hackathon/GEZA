# U3 Functional Design
> AI-DLC CONSTRUCTION Phase — Functional Design 成果物  
> ユニット: U3 リハーサルモード（AI台本の読み合わせ）  
> 生成日: 2026-05-07  
> ステータス: 承認待ち

---

## 設計方針サマリー

| 決定事項 | 内容 |
|---------|------|
| ページ構成 | practice.html 独立ページ + feedback.html 独立ページ（U4 拡張の土台） |
| 音声入力 | フロントエンド直接 Transcribe Streaming WebSocket（Cognito Identity Pool 経由） |
| テキスト・音声入力 | 常時両方表示（テキスト入力欄 + マイクボタン並列配置） |
| Polly 音声再生 | 自動再生（AI 応答受信後即時再生。練習開始ボタンで UserGesture 解除） |
| 練習終了条件 | 信頼度 ≥ 80 AND 怒り度 ≤ 20 でクリア自動判定 + 手動終了ボタン |
| フィードバック | feedback.html 別ページ。generate-feedback (Sonnet) 呼び出し |
| フォールバック | 1回目: 固定フォールバック返答 → 2回連続エラーでエラー通知 |
| evaluate-apology | 同期呼び出し（Nova Lite 1〜3s 実測。リアルタイム応答感を維持） |
| 会話履歴管理 | フロントエンドメモリのみ（messages 配列。DynamoDB 永続化なし） |
| sessionStorage 引き継ぎ | U2 の opponentProfile + apologyPlan を sessionStorage から読み取り |

---

## Step 1: ドメインモデル

### エンティティ

#### ConversationTurn（会話ターン）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| role | string | `"user"` / `"assistant"` |
| content | string | 発話テキスト |
| emotion_label | string | AI 返却の感情カテゴリ ID（15カテゴリ、`"assistant"` のみ） |
| anger_level | number | ターン後の怒り度 0〜100（`"assistant"` のみ） |
| trust_level | number | ターン後の信頼度 0〜100（`"assistant"` のみ） |
| ng_words | array | 検知 NG ワード配列（`"user"` ターンのみ） |
| follow_up_question | string | 追撃質問テキスト（オプション） |
| timestamp | number | Unix 時刻（ms） |

#### PracticeState（練習セッション状態）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| conversationHistory | ConversationTurn[] | 全会話履歴（フロントエンドメモリ管理） |
| currentAngryScore | number | 現在の怒り度（初期値: opponentProfile.anger_level） |
| currentTrustScore | number | 現在の信頼度（初期値: opponentProfile.trust_level） |
| turnCount | number | 送信ターン数 |
| consecutiveErrors | number | 連続エラー回数（フォールバック判定用） |
| sessionResult | string | `null` / `"clear"` / `"give_up"` / `"cleared"` |
| sessionId | string | UUIDv4（セッション識別子） |

#### FeedbackData（フィードバックデータ）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| finalAngryScore | number | 最終怒り度 |
| finalTrustScore | number | 最終信頼度 |
| turnCount | number | 総ターン数 |
| ngWordCount | number | NG ワード累計検知数 |
| conversationHistory | ConversationTurn[] | 会話履歴全件 |
| opponentProfile | object | 相手プロフィール（U2 から引き継ぎ） |
| problems | string[] | 問題点リスト（generate-feedback 返却） |
| improved_apology_text | string | 改善謝罪文（generate-feedback 返却） |

---

## Step 2: ユースケース

### UC-01: 謝罪練習開始（US-401）

```
前提条件:
  - ユーザーが Cognito 認証済み
  - sessionStorage に opponentProfile / apologyPlan が存在する

フロー:
  1. practice.html 読み込み
  2. requireAuth() で認証チェック → 未認証は index.html へリダイレクト
  3. sessionStorage から opponentProfile / apologyPlan を読み取り
     - 存在しない場合: 「まず謝罪プランを作成してください」メッセージ + inception.html へのリンクを表示
  4. AvatarController を初期化（opponentProfile.faceConfig を使用）
  5. PollySyncController を初期化（opponentProfile.gender で voice_id を決定）
  6. PracticeState を初期化:
     - currentAngryScore = opponentProfile.anger_level
     - currentTrustScore = opponentProfile.trust_level
     - sessionId = crypto.randomUUID()
  7. 怒り度・信頼度ゲージを表示
  8. 「練習を始める」ボタンを表示（UserGesture 確保のため自動開始しない）
  9. 「練習を始める」ボタン押下 → 相手の first_message を TTS で再生
  10. テキスト入力欄 + マイクボタンを活性化
```

### UC-02: テキスト謝罪入力 + AI 評価（US-402, US-405, US-406）

```
フロー:
  1. ユーザーがテキストを入力して送信
  2. バリデーション:
     - 空文字: 送信不可（ボタン disabled）
     - 2000文字超: トリム警告
  3. ローディング表示（アバターに「thinking」表情）
  4. POST /apology/evaluate を同期呼び出し:
     Request: {
       apology_text: <入力テキスト>,
       opponent_profile: <opponentProfile>,
       conversation_history: <conversationHistory（直近10ターン）>,
       session_id: <sessionId>
     }
  5. レスポンス処理:
     a. conversationHistory に user ターン追加
     b. AvatarController.setCategoryEmotion(emotion_label) でアバター表情更新
     c. 怒り度・信頼度ゲージをアニメーション更新
     d. response_text をチャット表示（textContent 使用）
     e. NG ワードがある場合はハイライト表示 + 理由・代替表現を表示
     f. follow_up_question がある場合は返答テキストの下に追記表示
     g. POST /tts/synthesize で response_text を音声変換 → 自動再生
     h. consecutiveErrors = 0 にリセット
     i. conversationHistory に assistant ターン追加
  6. クリア判定:
     - currentTrustScore >= 80 AND currentAngryScore <= 20 → sessionResult = "clear"
     → クリア演出 → feedback.html へ遷移
```

### UC-03: 音声謝罪入力（US-403）

```
フロー:
  1. マイクボタン押下 → MediaDevices.getUserMedia({ audio: true }) でマイク権限要求
  2. 権限取得後、TranscribeClient.startStreaming() で Transcribe WebSocket 接続開始:
     - Cognito Identity Pool から一時認証情報（AccessKeyId / SecretAccessKey / SessionToken）を取得
     - SigV4 署名付き WebSocket URL を生成
     - Transcribe Streaming に接続（言語: ja-JP、サンプルレート: 16000Hz）
  3. マイクボタンが「録音中」UIに変化（赤点滅）
  4. MediaRecorder で音声をキャプチャ → Transcribe WebSocket にリアルタイムストリーミング
  5. Transcribe の interim transcript をテキスト入力欄にリアルタイム表示
  6. ユーザーが「送信」ボタン押下 or 無音検出（3秒）でストリーミング停止
  7. final transcript 確定 → UC-02 と同じ evaluate-apology 呼び出しへ
```

### UC-04: Polly 音声再生 + 口パク同期（US-404）

```
フロー:
  1. POST /tts/synthesize を呼び出し:
     Request: { text: <response_text>, voice_id: "Kazuha" | "Takumi" }
     Response: { audio_base64: <MP3>, visemes: [{ time, value }] }
  2. audio_base64 を Blob URL に変換 → HTML Audio 要素に設定
  3. audio.play() で音声再生開始
  4. onplay イベントで PollySyncController.startVisemeSync(visemes) 開始:
     - visemes 配列を走査し、時刻（ms）に setTimeoutで AvatarController.setMouthViseme(value) を呼び出す
     - sil / a / i / u / e / o / p の7種類に対応
     - 音声終了（onended）で PollySyncController.stop() → 口を sil に戻す
  5. 発話中は AvatarController の headIdle を speakingNod に切り替え
```

### UC-05: 練習終了 + フィードバック遷移（US-407）

```
フロー（手動終了）:
  1. 「練習を終了する」ボタン押下 → 確認ダイアログ
  2. OK → sessionResult = "give_up"

フロー（クリア自動終了）:
  - currentTrustScore >= 80 AND currentAngryScore <= 20 達成時に自動遷移
  - sessionResult = "clear"

共通処理:
  3. FeedbackData を sessionStorage["practiceResult"] に保存
  4. feedback.html へ遷移
```

### UC-06: フィードバック表示（US-407）

```
フロー（feedback.html で実行）:
  1. sessionStorage["practiceResult"] から FeedbackData を読み取り
  2. スコアサマリーを表示（最終怒り度 / 信頼度 / ターン数 / NG ワード累計）
  3. POST /feedback/generate を呼び出し（generate-feedback Lambda: Claude Sonnet）:
     Request: {
       conversation_history: <conversationHistory>,
       opponent_profile: <opponentProfile>,
       final_angry_score: <finalAngryScore>,
       final_trust_score: <finalTrustScore>
     }
     Response: {
       problems: ["事実認定が曖昧", "再発防止策の言及なし", ...],
       improved_apology_text: "〇〇様、今回は...",
       overall_comment: "誠意は伝わりましたが..."
     }
  4. 問題点リストをリスト表示（textContent）
  5. 改善謝罪文をテキスト表示
  6. 「再挑戦する」ボタン → sessionStorage["practiceResult"] をクリア → practice.html へ戻る
```

### UC-07: API 障害フォールバック（US-408）

```
フォールバック戦略（C: 複合型）:
  - 1回目エラー: 固定フォールバック返答を表示
    response_text = "少し考えさせてください…" 
    emotion_label = "confusion"
    anger_level / trust_level = 前ターンの値（変化なし）
    consecutiveErrors += 1
  - 2回目以上の連続エラー:
    エラーバナー「通信エラーが発生しています。少し時間をおいてから再試行してください」を表示
    「もう一度試す」ボタンを表示
    マイクボタン・送信ボタンを disabled
```

---

## Step 3: 画面仕様

### 3-1: practice.html — 練習画面

```
[ヘッダー]
  <h1>GEZA — リハーサルモード</h1>
  [練習を終了する] ボタン（ゴースト）

[アバターエリア]
  <div id="practice-avatar-container">  ← facesjs SVG（200感情対応）
  
[ゲージエリア]
  怒り度: [===----] 65  信頼度: [==-----] 30
  （ターン数: 3 / NG: 1件）

[会話エリア]
  <div id="chat-area">
    [相手] 「連絡が遅すぎる...」         ← textContent
    [自分] 「誠に申し訳ございません...」  ← textContent
    [相手] 「それで再発防止は？」         ← textContent（追撃質問）
    ...

[入力エリア]
  <textarea id="apology-input" placeholder="謝罪の言葉を入力...">
  [🎤 音声入力] [送信] ボタン
  
  録音中: [🔴 録音中... — 停止]

[エラーバナー]（2回連続エラー時のみ表示）
  「通信エラーが発生しています」  [もう一度試す]

[クリア演出オーバーレイ]（クリア時のみ）
  「クリア！信頼度が回復しました」 [フィードバックを見る]
```

### 3-2: feedback.html — フィードバック画面

```
[ヘッダー]
  <h1>練習結果フィードバック</h1>

[スコアサマリー]
  最終怒り度: 15  最終信頼度: 85  ターン数: 7  NGワード: 2件
  結果: ✅ クリア（または ⚪ 任意終了）

[問題点リスト]
  ▶ 事実認定が曖昧（「おそらく」という表現）
  ▶ 再発防止策の言及がなかった
  ▶ 影響を受けた第三者への言及がない

[AI 改善謝罪文]
  「この度はご迷惑をおかけして...（AI 生成テキスト）」

[ボタン]
  [再挑戦する] [トップへ戻る]
  ※ U4 実装後: [詳細フィードバックを見る] [再発防止策を作る] を追加予定
```

---

## Step 4: コンポーネント設計

### 4-1: PracticePageController

```javascript
class PracticePageController {
  constructor(auth, apiClient, stateManager, avatarController, pollySyncController) {}

  /** 初期化。sessionStorage から opponentProfile / apologyPlan を読み取る */
  async init()

  /** 練習開始ボタン押下 → first_message TTS 再生 */
  async _handleStart()

  /** テキスト送信 → evaluate-apology → UI 更新 */
  async _handleSubmit()

  /** 音声入力開始/停止トグル */
  async _toggleMic()

  /** AI 評価レスポンスで UI を更新 */
  _updateUI(evalResult)

  /** ゲージアニメーション更新 */
  _animateGauge(angryScore, trustScore)

  /** NG ワードハイライト表示 */
  _renderNgWords(ngWords)

  /** チャット履歴に追加 */
  _appendChatMessage(role, text)

  /** クリア条件チェック */
  _checkClear()

  /** フォールバック処理 */
  _applyFallback(error)

  /** 練習終了 → sessionStorage 保存 → feedback.html 遷移 */
  _endSession(result)
}
```

### 4-2: FeedbackPageController

```javascript
class FeedbackPageController {
  constructor(auth, apiClient)

  /** 初期化。sessionStorage["practiceResult"] を読み取り */
  async init()

  /** スコアサマリー描画 */
  _renderScoreSummary(feedbackData)

  /** generate-feedback API 呼び出し → 問題点・改善文描画 */
  async _loadAndRenderFeedback(feedbackData)

  /** 再挑戦ボタン → practice.html へ戻る */
  _handleRetry()
}
```

### 4-3: TranscribeClient（shared/transcribe.js）

```javascript
class TranscribeClient {
  /**
   * Cognito Identity Pool から一時認証情報を取得し、
   * Transcribe Streaming WebSocket を開始する。
   * @param {Function} onTranscript - interim/final テキスト受信コールバック
   *   callback(text: string, isFinal: boolean)
   * @returns {Promise<void>}
   */
  async startStreaming(onTranscript)

  /** ストリーミングを停止し WebSocket をクローズする */
  stop()
}
```

#### Transcribe 接続フロー

```
1. AuthModule.getCognitoIdentityCredentials() で Cognito Identity Pool から
   { accessKeyId, secretAccessKey, sessionToken } を取得
2. region = "ap-northeast-1" の Transcribe Streaming URL を SigV4 で署名:
   wss://transcribestreaming.ap-northeast-1.amazonaws.com/stream-transcription-websocket
   ?language-code=ja-JP&media-encoding=pcm&sample-rate=16000
3. MediaRecorder で 16kHz PCM 音声をキャプチャ（mimeType: audio/webm が取れない場合は
   AudioContext でリサンプリング）
4. 音声チャンクを base64 エンコードしてイベントストリームフォーマットで WebSocket に送信
5. Transcribe からの Transcript イベントを受信してコールバックを呼び出す
6. final=true のテキストを onTranscript(text, true) で通知
```

> **インフラ前提**: U3 Infrastructure Design で `CognitoIdentityPool` を template.yaml に追加する。  
> Identity Pool の認証済みロールに `transcribe:StartStreamTranscription` 権限を付与する。

### 4-4: PollySyncController（shared/polly-sync.js）

```javascript
class PollySyncController {
  constructor(avatarController)

  /**
   * MP3 base64 を再生しつつ Viseme を同期する。
   * @param {string} audioBase64 - Polly MP3 base64
   * @param {Array<{time: number, value: string}>} visemes - Viseme タイムコード配列
   * @returns {Promise<void>} - 音声再生完了で resolve
   */
  async playWithSync(audioBase64, visemes)

  /** 再生を中断し口を sil に戻す */
  stop()
}
```

---

## Step 5: API 仕様（U3 使用分）

### POST `/apology/evaluate`（既定義。U3 で初回実装）

| 項目 | 値 |
|-----|---|
| Lambda | evaluate-apology |
| LLM モデル | amazon.nova-lite-v1:0（fast プロファイル） |
| タイムアウト | 10s（fast Lambda） |
| 同期/非同期 | 同期 |

**Request:**
```json
{
  "apology_text": "誠に申し訳ございません。確認不足によって...",
  "opponent_profile": {
    "type": "冷静だが厳格なPM",
    "anger_level": 65,
    "trust_level": 40,
    "ng_words": ["忙しくて", "確認不足で"],
    "avatar_seed": 3847291
  },
  "conversation_history": [
    { "role": "assistant", "content": "連絡が遅すぎる..." },
    { "role": "user", "content": "誠に申し訳ございません..." }
  ],
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "emotion_label": "irritation",
  "response_text": "そう言われても、再発防止はどう考えているんだ？",
  "anger_level": 60,
  "trust_level": 42,
  "anger_delta": -5,
  "trust_delta": 2,
  "ng_words": [
    { "word": "確認不足で", "reason": "原因を曖昧にしている", "alternative": "具体的な対策として..." }
  ],
  "follow_up_question": "再発防止策は具体的に何を考えているんだ？"
}
```

### POST `/tts/synthesize`（既定義。U3 で text-to-speech Lambda を実装）

| 項目 | 値 |
|-----|---|
| Lambda | text-to-speech |
| サービス | Amazon Polly（Neural TTS） |
| タイムアウト | 10s |

### POST `/feedback/generate`（U3 で実装、U4 で拡張）

| 項目 | 値 |
|-----|---|
| Lambda | generate-feedback |
| LLM モデル | Claude Sonnet（premium プロファイル） |
| タイムアウト | 29s（non-async premium） |
| 注意 | U3 では同期呼び出し。レスポンスが遅い場合はローディング表示を維持 |

**Request:**
```json
{
  "conversation_history": [...],
  "opponent_profile": {...},
  "final_angry_score": 15,
  "final_trust_score": 85
}
```

**Response:**
```json
{
  "problems": [
    "事実認定が曖昧（「おそらく」という表現を使用）",
    "再発防止策への具体的言及がなかった"
  ],
  "improved_apology_text": "この度は、私の確認ミスにより本番環境に障害を発生させてしまい...",
  "overall_comment": "誠意は十分に伝わりました。今後は事前の確認体制を強化することで..."
}
```

---

## Step 6: StateManager 拡張（practice ネームスペース）

```javascript
// state.js の StateManager に追加するネームスペース
StateManager.practice = {
  conversationHistory: [],   // ConversationTurn[]
  currentAngryScore: 0,      // opponentProfile.anger_level で初期化
  currentTrustScore: 0,      // opponentProfile.trust_level で初期化
  turnCount: 0,
  consecutiveErrors: 0,
  sessionResult: null,       // null | "clear" | "give_up"
  sessionId: null,           // crypto.randomUUID()
}
```

---

## Step 7: セキュリティコンプライアンス

| ID | 対策 | 実装箇所 |
|---|------|---------|
| XSS-01 | AI 生成テキスト（response_text / problems / improved_apology_text）はすべて `textContent` で挿入 | practice.js / feedback.js |
| AUTH-05 | `requireAuth()` を各ページ先頭で呼び出し（未認証リダイレクト） | practice.js / feedback.js |
| SECURITY-08 | evaluate-apology Lambda で `input_validator.validate()` を適用（2000文字制限・インジェクション検知） | backend |
| CORS-01 | API Gateway CORS 設定済み（U0 template.yaml）。追加変更なし | template.yaml |
| PROMPT-01 | `input_validator.INJECTION_PATTERNS` によるプロンプトインジェクション対策を Lambda 側で適用 | backend |
| PRIVACY-01 | Transcribe 音声は WebSocket で直接送信。Lambda / DynamoDB には保存しない | transcribe.js |

---

## 成果物サマリー

| ファイル | 新規/更新 | 概要 |
|---------|:-------:|------|
| `frontend/pages/practice.html` | 新規 | リハーサル練習画面 HTML |
| `frontend/pages/practice.js` | 新規 | PracticePageController |
| `frontend/pages/feedback.html` | 新規 | フィードバック画面 HTML（U4 拡張の土台） |
| `frontend/pages/feedback.js` | 新規 | FeedbackPageController |
| `frontend/shared/transcribe.js` | 新規 | TranscribeClient（Transcribe Streaming WebSocket） |
| `frontend/shared/polly-sync.js` | 新規 | PollySyncController（MP3 + Viseme 同期） |
| `backend/functions/evaluate-apology/lambda_function.py` | 実装（スタブ → 本実装） | Nova Lite 謝罪評価 |
| `backend/functions/text-to-speech/lambda_function.py` | 実装（スタブ → 本実装） | Polly TTS + SpeechMarks |
| `backend/functions/generate-feedback/lambda_function.py` | 実装（スタブ → 本実装） | Claude Sonnet フィードバック生成 |
| `backend/prompts/evaluate_apology.txt` | 新規 | Nova Lite 評価プロンプト |
| `backend/prompts/generate_feedback.txt` | 新規 | Sonnet フィードバックプロンプト |
| `template.yaml` | 更新 | CognitoIdentityPool 追加・Lambda 設定更新 |

---

## 前提インフラ変更（U3 で追加）

### Cognito Identity Pool（Transcribe 音声認識用）

Transcribe Streaming への直接アクセスには Cognito Identity Pool が必要。  
現在の template.yaml（U0 実装）は Cognito User Pool のみ。  
U3 Infrastructure Design で以下を追加する：

```yaml
GezaIdentityPool:
  Type: AWS::Cognito::IdentityPool
  Properties:
    AllowUnauthenticatedIdentities: false
    CognitoIdentityProviders:
      - ClientId: !Ref GezaUserPoolClient
        ProviderName: !GetAtt GezaUserPool.ProviderName

GezaIdentityPoolRoleAttachment:
  Type: AWS::Cognito::IdentityPoolRoleAttachment
  Properties:
    IdentityPoolId: !Ref GezaIdentityPool
    Roles:
      authenticated: !GetAtt GezaAuthenticatedRole.Arn

GezaAuthenticatedRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument: ...（Cognito Identity フェデレーション）
    Policies:
      - PolicyDocument:
          Statement:
            - Effect: Allow
              Action: transcribe:StartStreamTranscription
              Resource: "*"
```
