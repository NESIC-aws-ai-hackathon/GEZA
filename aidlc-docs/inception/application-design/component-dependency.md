# コンポーネント依存関係

> AI-DLC Application Design 成果物  
> 生成日: 2026-04-30

---

## 依存関係マトリックス

### フロントエンド → フロントエンド共通モジュール

| 呼び出し元（ページ） | 依存する共通モジュール |
|---------------------|----------------------|
| TopPage (top.js) | AuthModule, AvatarController, EmotionDefinitions, StateManager |
| InceptionPage (inception.js) | AuthModule, ApiClient, StateManager, AvatarController, ApologyMeter |
| AvatarCustomizePage (customize.js) | AuthModule, AvatarController, EmotionDefinitions, StateManager |
| StoryPage (story.js) | AuthModule, ApiClient, StateManager, AvatarController |
| PracticePage (practice.js) | AvatarController, EmotionDefinitions, StateManager, ApiClient, TranscribeClient, PollySyncController |
| FeedbackPage (feedback.js) | AuthModule, ApiClient, StateManager, AvatarController |
| CartePage (carte.js) | AuthModule, ApiClient, AvatarController, StateManager |
| BossPage (boss.js) | AuthModule, ApiClient, AvatarController, EmotionDefinitions, StateManager, TranscribeClient, PollySyncController |
| DuringSupportPage (during-support.js) | AuthModule, ApiClient, StateManager, TranscribeClient, AngerGauge, WhisperAdvisor |

### フロントエンド → バックエンド（API 呼び出し）

| フロントエンド | 呼び出す API エンドポイント | Lambda |
|------------|--------------------------|--------|
| InceptionPage | POST /apology/assess | AssessApologyLambda |
| InceptionPage | POST /opponent/generate | GenerateOpponentLambda |
| InceptionPage | POST /plan/generate | GeneratePlanLambda |
| StoryPage | POST /story/generate | GenerateStoryLambda |
| PracticePage | POST /apology/evaluate | EvaluateApologyLambda |
| PracticePage | POST /tts/synthesize | TextToSpeechLambda |
| PracticePage（音声入力） | Transcribe Streaming（直接） | — |
| FeedbackPage | POST /feedback/generate | GenerateFeedbackLambda |
| FeedbackPage | POST /prevention/generate | GeneratePreventionLambda |
| FeedbackPage | POST /mail/generate | GenerateFollowMailLambda |
| FeedbackPage | POST /sessions | SaveSessionLambda |
| CartePage | GET /karte | GetKarteLambda |
| CartePage | GET /karte/{sessionId} | GetKarteLambda |
| CartePage | GET /karte/analyze | AnalyzeKarteLambda |
| BossPage | POST /guidance/evaluate | EvaluateGuidanceLambda |
| BossPage | POST /tts/synthesize | TextToSpeechLambda |
| BossPage | POST /sessions | SaveSessionLambda |
| BossPage | POST /guidance/feedback | GenerateGuidanceFeedbackLambda |
| DuringSupportPage | POST /during/analyze-anger | AnalyzeAngerLambda |
| DuringSupportPage | POST /during/detect-danger | DetectDangerSpeechLambda |
| DuringSupportPage | POST /sessions | SaveSessionLambda |
| DuringSupportPage（音声入力） | Transcribe Streaming（直接） | — |

### バックエンド → AWS サービス

| Lambda | 依存する AWS サービス | 用途 |
|--------|---------------------|------|
| EvaluateApologyLambda | Bedrock (Nova Lite) | 謝罪評価・感情分類 |
| AssessApologyLambda | Bedrock (Nova Lite) | 謝罪角度アセスメント（0〜180°算出） |
| GenerateOpponentLambda | Bedrock (Claude Sonnet) | 謝罪相手プロフィール生成 |
| GenerateStoryLambda | Bedrock (Claude Sonnet) | ストーリー生成 |
| GeneratePlanLambda | Bedrock (Claude Sonnet) | 謝罪プラン生成 |
| TextToSpeechLambda | Polly (Kazuha Neural / Takumi Neural) | MP3 + SpeechMarks（genderで音声切り替え） |
| GenerateFeedbackLambda | Bedrock (Claude Sonnet) | フィードバック生成 |
| GeneratePreventionLambda | Bedrock (Claude Sonnet) | 再発防止策生成 |
| GenerateFollowMailLambda | Bedrock (Claude Sonnet) | メール生成 |
| AnalyzeKarteLambda | Bedrock (Nova Lite), DynamoDB | 傾向分析 |
| SaveSessionLambda | DynamoDB | セッション保存 |
| GetKarteLambda | DynamoDB | カルテ取得 |
| EvaluateGuidanceLambda | Bedrock (Nova Lite) | 指導評価 |
| GenerateGuidanceFeedbackLambda | Bedrock (Claude Sonnet) | 改善スクリプト生成 |
| AnalyzeAngerLambda | Bedrock (Nova Lite), DynamoDB | 怒り残量リアルタイム分析 |
| DetectDangerSpeechLambda | Bedrock (Nova Lite), DynamoDB | 危険発言検知・助言生成 |
| 全 Lambda | S3 (prompts/) | プロンプトテンプレート読み込み |

---

## データフロー図

### 謝罪練習コアフロー（US-401〜406）

```
ユーザー
  │ テキスト入力 または 音声入力
  ▼
[PracticePage - practice.js]
  │
  ├─[音声の場合]─→ [TranscribeClient]
  │                  │ Cognito Identity Pool で一時認証取得
  │                  │ WebSocket → Transcribe Streaming (ja-JP)
  │                  │ リアルタイム文字起こし → PracticePage にコールバック
  │                  ↓
  │               確定テキスト
  │
  ├─→ ApiClient.post("/apology/evaluate", { apology_text, opponent_profile, history })
  │     │
  │     ▼ API Gateway (JWT Authorizer)
  │     ▼ EvaluateApologyLambda
  │       │ PromptLoader → backend/prompts/evaluate-apology.txt
  │       │ BedrockClient.invoke_nova_lite()
  │       │ update_gauges()
  │       ↓
  │     { emotion_label, response_text, anger_level, trust_level, ng_words, follow_up_question }
  │
  ├─→ AvatarController.setEmotion(emotion_label)  ← 0.5秒以内
  │    └─→ EmotionDefinitions.getEmotionCSS(emotion_label)
  │    └─→ EmotionDefinitions.getEffect(emotion_label) → triggerShake() / triggerBrighten()
  │
  ├─→ StateManager.setAppState({ anger_level, trust_level, ... })
  │
  ├─→ ApiClient.post("/tts/synthesize", { text: response_text })
  │     │
  │     ▼ API Gateway
  │     ▼ TextToSpeechLambda
  │       │ Polly.synthesize_speech() (MP3) ─┐ 並列実行
  │       │ Polly.synthesize_speech() (SpeechMarks) ─┘
  │       ↓
  │     { audio_base64, visemes: [{time, value},...] }
  │
  └─→ PollySyncController.playWithSync(audio_base64, visemes, avatarController)
        │ AudioContext で MP3 再生開始
        │ scheduleVisemes() → avatarController.applyViseme() を 50ms 精度でスケジュール
        └─ 再生終了 → avatarController.applyViseme("sil")
```

---

### セッション保存フロー（US-601）

```
FeedbackPage
  │ 練習終了（クリア/失敗/終了）
  ▼
StateManager.getCurrentSession()
  → { sessionId, conversationHistory, angerLevel, trustLevel, ngWordsUsed, avatarSeed }
  │
  └─→ ApiClient.post("/sessions", { session_type: "APOLOGY", data: {...} })
        │
        ▼ SaveSessionLambda
          │ save_session() → DynamoDB PK="USER#<userId>" SK="SESSION#<ts>#<sid>"
          │ save_turn() × Nターン → DynamoDB PK="USER#<userId>" SK="TURN#<sid>#<n>"
          ↓
        { saved: true, session_id }
```

---

### 謝罪中支援フロー（US-1001〜1003）

```
対面謝罪の場（相手＋ユーザー）
  │
  ├─── 相手の発言 ───────────────────────────────────────────────┐
  │                                                              │
  │  [DuringSupportPage - during-support.js]                     │
  │    │                                                         │
  │    ├─[相手音声]─→ [TranscribeClient]                         │
  │    │               │ Cognito Identity Pool 一時認証取得        │
  │    │               │ WebSocket → Transcribe Streaming (ja-JP) │
  │    │               │ リアルタイム文字起こし → コールバック        │
  │    │               ↓                                         │
  │    │            確定テキスト（相手発言）                        │
  │    │               │                                         │
  │    │    ├─→ ApiClient.post("/during/analyze-anger",           │
  │    │    │     { opponent_text, opponent_profile, context })   │
  │    │    │       │                                            │
  │    │    │       ▼ API Gateway (JWT Auth)                     │
  │    │    │       ▼ AnalyzeAngerLambda (Timeout: 10s)          │
  │    │    │         │ PromptLoader → analyze-anger.txt          │
  │    │    │         │ BedrockClient.invoke_nova_lite()          │
  │    │    │         │ determine_trend() + generate_summary()    │
  │    │    │         ↓                                          │
  │    │    │       { anger_remaining, disappointment,            │
  │    │    │         tolerance_remaining, counterattack_risk,    │
  │    │    │         trend, summary }                            │
  │    │    │       │                                            │
  │    │    │       ↓                                            │
  │    │    ├─→ AngerGauge.update(data)  ← ゲージ更新             │
  │    │    ├─→ AngerGauge.pushHistory(entry) ← 推移データ蓄積    │
  │    │    └─→ StateManager.setAppState({ angerRemaining, ... })│
  │    │                                                         │
  │    ├─[ユーザー音声]─→ [TranscribeClient]                      │
  │    │                   │ 別ストリームで接続                     │
  │    │                   ↓                                     │
  │    │                確定テキスト（ユーザー発話）                 │
  │    │                   │                                     │
  │    │    ├─→ ApiClient.post("/during/detect-danger",           │
  │    │    │     { user_text, opponent_profile })                │
  │    │    │       │                                            │
  │    │    │       ▼ API Gateway (JWT Auth)                     │
  │    │    │       ▼ DetectDangerSpeechLambda (Timeout: 10s)    │
  │    │    │         │ PromptLoader → detect-danger-speech.txt   │
  │    │    │         │ BedrockClient.invoke_nova_lite()          │
  │    │    │         │ detect_dangers() + generate_short_whisper()│
  │    │    │         ↓                                          │
  │    │    │       { dangers_detected, overall_risk,             │
  │    │    │         short_whisper }                             │
  │    │    │       │                                            │
  │    │    │       ↓                                            │
  │    │    ├─→ WhisperAdvisor.showAdvice(result) ← 助言表示      │
  │    │    └─→ StateManager.setAppState({ dangersDetected, ... })│
  │    │                                                         │
  │    └─[セッション終了]                                         │
  │         │ endDuringSupport()                                  │
  │         │ angerHistory = AngerGauge.getHistory()              │
  │         │ dangerLog = WhisperAdvisor.getDangerLog()           │
  │         │                                                    │
  │         └─→ ApiClient.post("/sessions",                      │
  │               { session_type: "DURING", data: {              │
  │                   angerHistory, dangerLog, summary } })       │
  │               │                                              │
  │               ▼ SaveSessionLambda                            │
  │                 │ save_session() → DynamoDB                   │
  │                 │   PK="USER#<userId>"                       │
  │                 │   SK="DURING#<ts>#<sid>"                   │
  │                 │ 推移データ → ANGER#<ts>                     │
  │                 │ 危険発言ログ → DANGER#<ts>                  │
  │                 ↓                                            │
  │               { saved: true, session_id }                    │
  └──────────────────────────────────────────────────────────────┘
```

---

### アバター生成・復元フロー

```
[新規生成] InceptionPage / StoryPage / BossPage
  │ GenerateOpponent/Story/Guidance API → avatarSeed を取得
  └─→ AvatarController.init(container, avatarSeed)
        └─ facesjs.generate({ seed }) → SVG 描画
        └─ StateManager.setSessionData("avatarSeed", avatarSeed)

[カスタマイズ] AvatarCustomizePage（実案件モードのみ）
  │ ユーザーが髪型/肌色等を変更
  └─→ AvatarController.updateAppearance(params)
        └─ facesjs.display() で再描画（リアルタイムプレビュー）
        └─ StateManager.setSessionData("avatarConfig", avatarController.exportConfig())

[復元] CartePage
  │ DynamoDB から avatarSeed を取得
  └─→ AvatarController.init(container, savedSeed)
        └─ 同一 seed → 同じ顔を再現
```

---

## コンポーネント結合度マトリックス

| | AvatarController | EmotionDefs | StateManager | ApiClient | TranscribeClient | PollySyncController | ApologyMeter |
|---|---|---|---|---|---|---|---|
| **PracticePage** | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ☆ |
| **BossPage** | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ☆ |
| **InceptionPage** | ★★ | ☆ | ★★★ | ★★★ | ☆ | ☆ | ★★★ |
| **StoryPage** | ★★ | ☆ | ★★★ | ★★★ | ☆ | ☆ | ☆ |
| **CartePage** | ★★ | ☆ | ★★ | ★★★ | ☆ | ☆ | ☆ |
| **FeedbackPage** | ☆ | ☆ | ★★ | ★★★ | ☆ | ☆ | ☆ |
| **TopPage** | ★★ | ★ | ★ | ☆ | ☆ | ☆ | ☆ |

★★★ 強依存 / ★★ 中依存 / ★ 弱依存 / ☆ 非依存
