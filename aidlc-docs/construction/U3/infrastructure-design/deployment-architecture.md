# U3 デプロイメントアーキテクチャ
> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-07  
> 対象ユニット: U3（リハーサルモード）

---

## 全体アーキテクチャ図

```
ブラウザ
├── practice.html
│   ├── [マイク入力]
│   │   └── Amazon Transcribe Streaming
│   │       WebSocket (SigV4署名)
│   │       └── Cognito Identity Pool
│   │           → GezaIdentityPoolAuthRole
│   │           → transcribe:StartStreamTranscriptionWebSocket
│   │
│   ├── [謝罪送信]
│   │   └── POST /apology/evaluate
│   │       └── API Gateway HTTP API (JWT必須)
│   │           └── evaluate-apology Lambda
│   │               ├── Bedrock: Nova Lite (感情評価)
│   │               └── S3 Prompts: evaluate_apology.txt
│   │
│   └── [ボス音声再生]
│       └── POST /tts/synthesize
│           └── API Gateway HTTP API (JWT必須)
│               └── text-to-speech Lambda
│                   └── Polly: Takumi (ja-JP)
│                       MP3 + visemes → base64 返却
│
└── feedback.html
    └── POST /feedback/generate
        └── API Gateway HTTP API (JWT必須)
            └── generate-feedback Lambda
                ├── Bedrock: Claude Sonnet (フィードバック生成)
                └── S3 Prompts: generate_feedback.txt
```

---

## データフロー

### 練習ターン（evaluate-apology）

```
[フロントエンド]                  [Lambda]                [外部サービス]
practice.js
  │
  ├── 1. transcribe.js 起動
  │      Cognito IdentityCredentials 取得
  │      WebSocket SigV4署名 URL 生成
  │      Transcribe Streaming 接続
  │      音声PCM → テキスト（ストリーミング）
  │
  ├── 2. POST /apology/evaluate
  │      {
  │        boss_id: "yamada",
  │        apology_text: "大変申し訳...",
  │        turn: 1,
  │        conversation_history: [...]
  │      }
  │      ──────────────────────────→  evaluate-apology Lambda
  │                                        │
  │                                        ├── S3: evaluate_apology.txt 読込
  │                                        ├── Bedrock Converse API
  │                                        │   (Nova Lite, 同期)
  │                                        └── JSON返却
  │      ←──────────────────────────
  │      {
  │        boss_message: "それだけ？",
  │        emotion: {trust:45, anger:65},
  │        is_clear: false,
  │        turn: 1
  │      }
  │
  ├── 3. POST /tts/synthesize
  │      { text: "それだけ？", voice_id: "Takumi" }
  │      ──────────────────────────→  text-to-speech Lambda
  │                                        └── Polly SynthesizeSpeech
  │                                            OutputFormat: mp3
  │                                            SpeechMarkTypes: viseme
  │      ←──────────────────────────
  │      {
  │        audio_base64: "//NExAA...",
  │        visemes: [{"time":0,"value":"sil"},...]
  │      }
  │
  └── 4. polly-sync.js 再生
         Blob URL 生成 → Audio 再生
         viseme タイミングで boss-face 口パク同期
         再生完了 → revokeObjectURL
```

### フィードバック生成（generate-feedback）

```
[フロントエンド]                  [Lambda]                [外部サービス]
feedback.js
  │
  └── POST /feedback/generate
         {
           boss_id: "yamada",
           conversation_history: [...10ターン...],
           final_emotion: {trust:82, anger:18},
           is_cleared: true
         }
         ──────────────────────────→  generate-feedback Lambda
                                           │
                                           ├── S3: generate_feedback.txt 読込
                                           ├── Bedrock Converse API
                                           │   (Claude Sonnet, 同期, ~25s)
                                           └── JSON返却
         ←──────────────────────────
         {
           score: 87,
           grade: "A",
           strengths: [...],
           improvements: [...],
           boss_comment: "次は期待してるよ"
         }
```

---

## Lambda 設定マトリクス（U3確定版）

| 関数名 | MemorySize | Timeout | モデル | プロファイル |
|-------|:----------:|:-------:|-------|:----------:|
| evaluate-apology | 256 MB | 10 s | Nova Lite | fast ✅ |
| text-to-speech | 256 MB | 10 s | Polly Takumi | fast ✅ |
| generate-feedback | **1024 MB** | **29 s** | Claude Sonnet | premium ⚠️変更 |

⚠️ `generate-feedback` のみ template.yaml 変更が必要（スタブ設定の上書き）

---

## Cognito フロー（Transcribe 用一時認証情報）

```
1. ユーザー認証（Cognito User Pool）
   │  IDトークン（JWT）取得
   ↓
2. getCognitoIdentityCredentials() in auth.js
   │  POST cognito-identity.amazonaws.com
   │  GetId → GetCredentialsForIdentity
   ↓
3. 一時認証情報取得
   │  AccessKeyId / SecretAccessKey / SessionToken
   │  有効期限: 1時間（練習セッション十分）
   ↓
4. TranscribeClient.start() in transcribe.js
   │  SigV4署名 WebSocket URL 生成
   │  wss://transcribestreaming.ap-northeast-1.amazonaws.com/stream-transcription-websocket?...
   ↓
5. WebSocket 接続確立
   │  PCM 16kHz mono → バイナリフレーム送信
   ↓
6. TranscriptEvent 受信
   │  Partial → 暫定テキスト表示
   │  Final → 確定テキスト → apology_text に設定
   ↓
7. 無音検出（3秒）または手動停止
   └── WebSocket close
```

---

## エラーハンドリング方針

| エラー種別 | 対象 | 挙動 |
|----------|------|------|
| evaluate-apology タイムアウト（9.5s AbortController） | フロントエンド | 1回目: 固定返答（「少し考えさせてください…」）<br>2回連続: エラーバナー表示 |
| Transcribe 接続失敗 | フロントエンド | テキスト入力モードにフォールバック |
| generate-feedback タイムアウト（29s） | フロントエンド | スピナー継続 → エラーバナー（最大1回リトライ）|
| Polly 失敗 | フロントエンド | ボス台詞テキストのみ表示（音声なし継続）|

---

## ファイル構成（Code Generation 対象）

```
backend/
  functions/
    evaluate-apology/
      lambda_function.py   ← 本実装（スタブ置き換え）
    text-to-speech/
      lambda_function.py   ← 本実装（スタブ置き換え）
    generate-feedback/
      lambda_function.py   ← 本実装（スタブ置き換え）
  prompts/
    evaluate_apology.txt   ← 新規
    generate_feedback.txt  ← 新規

frontend/
  pages/
    practice.html          ← 新規
    practice.js            ← 新規
    feedback.html          ← 新規
    feedback.js            ← 新規
  shared/
    transcribe.js          ← 新規
    polly-sync.js          ← 新規
    auth.js                ← 更新（getCognitoIdentityCredentials 追加）
    state.js               ← 更新（practice ネームスペース追加）
```

---

## template.yaml 変更差分（最終確認）

### GenerateFeedbackFunction（変更あり）

| 項目 | 変更前 | 変更後 |
|-----|:-----:|:-----:|
| MemorySize | 256 | **1024** |
| Timeout | 10 | **29** |
| IAM: dynamodb:PutItem | ✅ あり | ❌ 削除 |
| IAM: sqs:SendMessage | ✅ あり | ❌ 削除 |
| IAM: bedrock:Converse | ❌ なし | ✅ 追加 |
| IAM: s3:GetObject (Prompts) | ❌ なし | ✅ 追加 |

変更理由: U2 スタブは「非同期 SQS キュー投入」を想定していたが、U3 では同期処理に変更。
