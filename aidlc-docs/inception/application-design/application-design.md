# アプリケーション設計 統合ドキュメント

> 最終更新: 2026-05-01（コンセプト転換: 謝罪丸投げコンシェルジュ / 謝罪角度機能追加）  
> 生成日: 2026-04-30  
> 詳細定義ファイル: components.md / component-methods.md / services.md / component-dependency.md

---

## 1. 設計概要

### 1.1 プロダクト概要

GEZAは**謝罪丸投げコンシェルジュ**です。  
やらかした内容を一言入れるだけで、謝罪角度判定→台本フル生成→タイミング・手土産提案まで全部AIがやります。あなたは頭を下げるだけ。  
キラー機能は**謝罪の角度アセスメント**—やらかしの深刻度をAIが0〜180°の角度で数値化し、ステージ別ピクトグラム画像＋スタンプ演出＋SE音で表示します。

### 1.2 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | HTML5 + 共通 JS/CSS モジュール（複数ページ構成） |
| アバター描画 | facesjs v5.0.3（フォーク版・IIFE Bundle）|
| 音声合成 | Amazon Polly（Kazuha：女性 / Takumi：男性, ja-JP, Neural, MP3 + SpeechMarks） |
| 音声認識 | Amazon Transcribe Streaming（WebSocket 直接接続, ja-JP） |
| バックエンド | AWS Lambda (Python 3.12, 512MB, 30s) × 20関数 |
| LLM | Amazon Nova Lite（評価・分類）/ Claude Sonnet（生成） |
| DB | DynamoDB シングルテーブル（PAY_PER_REQUEST） |
| 認証 | Amazon Cognito User Pool（ログイン） + Identity Pool（Transcribe 一時認証） |
| API | API Gateway HTTP API v2（JWT Authorizer） |
| ホスティング | S3 + CloudFront |
| IaC | AWS SAM |

---

## 2. アーキテクチャ概要図

```
┌─────────────────────────────────────────────────────────────────┐
│                         ブラウザ                                  │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ TopPage  │  │Inception │  │Practice  │  │  BossPage        │ │
│  │          │  │ Page     │  │ Page     │  │  (指導モード)     │ │
│  └──────────┘  └──────────┘  └────┬─────┘  └────────┬─────────┘ │
│                                   │                  │           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   共通モジュール                             │  │
│  │  AvatarController │ EmotionDefs │ StateManager │ ApiClient │  │
│  │  TranscribeClient │ PollySyncController                    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────┬────────────────────────────────┬──────────────────────┘
           │ HTTPS (JWT Auth)               │ WebSocket + 一時認証
           ▼                                ▼
┌──────────────────────┐      ┌─────────────────────────────────┐
│   API Gateway        │      │   Amazon Transcribe Streaming   │
│   HTTP API v2        │      │   (音声 → テキスト, ja-JP)       │
│   JWT Authorizer     │      └─────────────────────────────────┘
│   (Cognito UP)       │
└──────────┬───────────┘
           │
     ┌─────┴──────────────────────────────────┐
     │           Lambda 関数群（20本）           │
     │                                         │
     │  Nova Lite 系              Sonnet 系     │
     │  ・assess-apology         ・generate-opponent │
     │  ・evaluate-apology       ・generate-story    │
     │  ・analyze-karte          ・generate-plan     │
     │  ・evaluate-guidance      ・generate-feedback │
     │  インフラ系                ・generate-prevention│
     │  ・save-session           ・generate-mail     │
     │  ・get-karte              ・text-to-speech    │
     │  ・(shared-utils-layer)   ・guidance-feedback │
     └─────┬────────────┬──────────────────────┘
           │            │
           ▼            ▼
┌───────────────┐  ┌─────────────────────────────┐
│   DynamoDB    │  │   Amazon Bedrock             │
│   geza-data   │  │   ・Nova Lite (評価/分類)     │
│   シングルテーブル│  │   ・Claude Sonnet (生成)    │
└───────────────┘  └─────────────┬───────────────┘
                                 │
                   ┌─────────────┴───────┐
                   │   Amazon Polly      │
                   │   Kazuha / Takumi Neural │
                   │   MP3 + SpeechMarks     │
                   └─────────────────────┘
```

---

## 3. 設計決定事項サマリー（Q1〜Q15）

| Q# | 決定事項 | 選択 | 理由 |
|----|----------|------|------|
| Q1 | フロントエンド構成 | B: 複数HTML + 共通JS/CSS | ページ間の状態をsessionStorageで引き継ぎ、シンプルな構成 |
| Q2 | 状態管理 | A+C Hybrid: 3層ステート | リアルタイム(AppState) + セッション間(sessionStorage) + 永続(DynamoDB) |
| Q3 | アバター/感情分離 | C: avatar.js + emotions.js | テスタビリティ・再利用性を確保 |
| Q4 | Lambda分割粒度 | A: 細粒度20関数 | 独立デプロイ・スケーリング・タイムアウト最適化（初期14関数、E035/E038拡張で計全20本） |
| Q5 | Bedrockモデル | A: Nova Lite/Sonnet分離 | コスト最適化（評価はNova Lite、高品質生成はSonnet） |
| Q6 | 音声認識接続 | A: Transcribe直接WebSocket | Lambda経由は不要、Cognito Identity Poolで安全に認証 |
| Q7 | DB設計 | A: DynamoDBシングルテーブル | アクセスパターンが明確、コスト効率 |
| Q8 | 会話履歴保存 | A: 全ターン保存 | カルテ分析・改善追跡に必要 |
| Q9 | API設計 | A: RESTful（リソースベース） | 直感的な設計。0エンドポイント（初期15、E035+E038拡張で計全20本） |
| Q10 | 認証方式 | A: API Gateway JWT Authorizer | Cognito統合、Lambda内認証不要 |
| Q11 | プロンプト管理 | A: backend/prompts/配置 | バージョン管理しやすく、テスト容易 |
| Q12 | エラーハンドリング | B: @handle_errors デコレーター | 全Lambdaに一貫したエラー処理 |
| Q13 | IaC | C: AWS SAM | Lambda/API GatewayのIaC標準、CDKより軽量 |
| Q14 | シナリオ詳細 | 6シナリオ（謝罪3 + 指導3）| MVP スコープで多様性確保 |
| Q15 | TTS返却形式 | A: MP3 + visemes同一レスポンス | 1API呼び出しで音声と口パクデータを取得 |

---

## 4. フロントエンド構成

### 4.1 ページ一覧

| ページ | ファイル | 主要機能 |
|--------|---------|---------|
| トップ | `frontend/index.html` | ログイン・モード選択・角度デモ |
| インセプション | `frontend/inception.html` | やらかし入力・**謝罪角度アセスメント**・謝罪相手生成 |
| カスタマイズ | `frontend/customize.html` | アバター外観カスタマイズ |
| ストーリー | `frontend/story.html` | ストーリー・プラン提示 |
| 練習 | `frontend/practice.html` | 謝罪練習対話（コア画面） |
| フィードバック | `frontend/feedback.html` | 練習結果・改善提案 |
| カルテ | `frontend/carte.html` | 練習履歴・傾向分析 |
| ボス（上司モード） | `frontend/boss.html` | 指導練習対話 |
| 謝罪中支援 | `frontend/during-support.html` | 怒り残量スキャナー・耳打ちモード・統合ダッシュボード |

### 4.3 新共通モジュール: ApologyMeter

`frontend/shared/apology-meter.js`

```javascript
class ApologyMeter {
  // 角度値（0〜180）を受け取り、ステージ別ピクトグラム画像をスタンプ演出＋SE音で表示する
  // degree: 0〜180の角度値
  setDegree(degree)

  // 角度ステージ名を返す（会釈/深謝/土下座/寝下座/焦げ下座/焼き寝下座）
  getStageName(degree)

  // 自己申告角度とAI角度のギャップ分析結果を表示
  // aiDegree: AI判断の角度
  // selfDegree: 自己申告角度
  showGapAnalysis(aiDegree, selfDegree)
}
```

### 4.2 3層ステート設計

```
Layer 1: window.AppState（ページ内リアルタイム）
  用途: 感情ラベル・怒り度・信頼度・現在の会話ターン
  スコープ: 同一ページ内のみ（ページ遷移でリセット）

Layer 2: sessionStorage（セッション間引き継ぎ）
  用途: やらかし入力→練習→支援フローの引き継ぎ
        avatarSeed、bossProfile
  スコープ: タブが閉じるまで

Layer 3: DynamoDB API経由（永続化）
  用途: カルテ・練習履歴・スコア推移
  スコープ: アカウント存続期間
```

---

## 5. バックエンド構成

### 5.1 Lambda関数一覧

| # | 関数名 | Bedrockモデル | メモリ | Timeout |
|---|--------|-------------|--------|---------|
| 1 | **assess-apology** | Nova Lite | 512MB | 30s |
| 2 | evaluate-apology | Nova Lite | 512MB | 30s |
| 3 | generate-opponent | Claude Sonnet | 512MB | 30s |
| 4 | generate-story | Claude Sonnet | 512MB | 30s |
| 5 | generate-plan | Claude Sonnet | 512MB | 30s |
| 6 | text-to-speech | Polly | 512MB | 30s |
| 7 | generate-feedback | Claude Sonnet | 512MB | 30s |
| 8 | generate-prevention | Claude Sonnet | 512MB | 30s |
| 9 | generate-follow-mail | Claude Sonnet | 512MB | 30s |
| 10 | save-session | — | 512MB | 30s |
| 11 | get-karte | — | 512MB | 30s |
| 12 | analyze-karte | Nova Lite | 512MB | 30s |
| 13 | evaluate-guidance | Nova Lite | 512MB | 30s |
| 14 | generate-guidance-feedback | Claude Sonnet | 512MB | 30s |
| 15 | check-draft | Nova Lite | 512MB | 30s |
| 16 | analyze-reply | Claude Sonnet | 512MB | 30s |
| 17 | save-story-log | — | 512MB | 30s |
| 18 | diagnose-tendency | Claude Sonnet | 512MB | 30s |
| **19** | **analyze-anger** | **Nova Lite** | **512MB** | **10s** |
| **20** | **detect-danger-speech** | **Nova Lite** | **512MB** | **10s** |

### 5.2 共有 Lambda Layer

`shared-utils-layer` に以下を含む:
- `decorators.py`: `@handle_errors` デコレーター
- `prompt_loader.py`: プロンプトテンプレート読み込み
- `bedrock_client.py`: Bedrock呼び出しラッパー（Nova Lite / Claude Sonnet）

### 5.3 プロンプトテンプレート

`backend/prompts/` に配置、変数は `{{variable_name}}` 形式:

```
backend/prompts/
  assess-apology.txt
  evaluate-apology.txt
  generate-opponent.txt
  generate-story.txt
  generate-plan.txt
  generate-feedback.txt
  generate-prevention.txt
  generate-follow-mail.txt
  analyze-karte.txt
  evaluate-guidance.txt
  generate-guidance-feedback.txt
```

---

## 6. 感情システム

### 6.1 30感情定義

| カテゴリ | 感情ID一覧 | 特殊エフェクト |
|---------|-----------|--------------|
| 強い怒り | rage, anger, fury, intimidation | rage → 画面揺れ |
| 不満 | irritation, frustration, impatience | — |
| 悲しみ | disappointment, sadness, bitterness | — |
| 冷たい | contempt, disgust, coldness, sarcasm | — |
| 驚き | surprise, shock | shock → 画面揺れ |
| 疑い | suspicion, skepticism | — |
| 諦め | weariness, resignation | — |
| 中立 | confusion, hesitation, thinking | — |
| 好転 | interest, empathy | — |
| 肯定 | relief, acceptance, appreciation, satisfaction, forgiveness | forgiveness → 画面明暗変化 |

### 6.2 口パクシステム（Viseme）

- Amazon Polly SpeechMarks で `viseme` タイプを取得
- `PollySyncController.scheduleVisemes()` でタイムコードに基づき `AvatarController.applyViseme()` を呼び出し
- 音声とアニメーションの同期精度: 50ms 以内（US-404 AC-2）
- `data-feature="mouth"` 属性で口形状を facesjs SVG に適用

---

## 7. セキュリティ設計

| 項目 | 対策 |
|------|------|
| API 認証 | Cognito JWT Authorizer（全エンドポイント） |
| Transcribe 認証 | Cognito Identity Pool 一時認証情報（最小権限: transcribe のみ） |
| XSS 対策 | DOM操作は `textContent` を使用（`innerHTML` 禁止） |
| 個人情報 | 実在の人物名・企業名をボスとして生成しない（プロンプト制約） |
| 環境変数 | `.env` を git にコミットしない |
| プロンプトインジェクション | `backend/shared/input_validator.py` で以下を実施：① 入力文字数制限（500文字以内）② システムプロンプト注入パターンのブラックリスト検知（「ignore above」「system:」「You are」等）③ Bedrock 呼び出し時の JSON 出力強制（response_format 指定）④ 入力サニタイズ（制御文字除去・HTMLタグストリップ） |
| 機密 | LLM API は Lambda 経由のみ、フロントエンドから直接呼ばない |

---

## 8. フォールバック設計（US-408）

| 障害シナリオ | フォールバック動作 |
|------------|-----------------|
| Transcribe 接続失敗 | テキスト入力エリアにフォーカス、音声不可アイコン表示 |
| Polly TTS 失敗 | 音声なしアイコン表示、テキストのみで練習継続 |
| Bedrock タイムアウト | `@handle_errors` → 503 レスポンス、フロントでリトライ案内 |
| DynamoDB 書き込み失敗 | `@handle_errors` → 500 レスポンス、セッションデータはsessionStorageに保持 |

---

## 9. ディレクトリ構成（予定）

```
GEZA/
├── frontend/
│   ├── index.html / inception.html / customize.html
│   ├── story.html / practice.html / feedback.html
│   ├── carte.html / boss.html
│   ├── check.html / reply.html / diagnosis.html
│   ├── during-support.html
│   └── shared/
│       ├── avatar.js / emotions.js / state.js
│       ├── api.js / transcribe.js / polly-sync.js
│       ├── anger-gauge.js / whisper-advisor.js
│       └── auth.js / style.css
│
├── backend/
│   ├── functions/
│   │   ├── assess-apology/       ├── evaluate-apology/
│   │   ├── generate-opponent/    ├── generate-story/
│   │   ├── generate-plan/        ├── text-to-speech/
│   │   ├── generate-feedback/    ├── generate-prevention/
│   │   ├── generate-follow-mail/ ├── save-session/
│   │   ├── get-karte/            ├── analyze-karte/
│   │   ├── evaluate-guidance/
    │   ├── generate-guidance-feedback/
    │   ├── check-draft/          ├── analyze-reply/
    │   ├── save-story-log/       ├── diagnose-tendency/
    │   ├── analyze-anger/        └── detect-danger-speech/
│   ├── shared/
│   │   ├── decorators.py / prompt_loader.py / bedrock_client.py
│   └── prompts/
        └── *.txt（16プロンプトテンプレート）
│
├── template.yaml    ← SAM テンプレート
├── docs/            ← 統合仕様書
└── aidlc-docs/      ← AI-DLC 成果物
```

---

## 10. 詳細成果物リンク

| 成果物 | パス |
|--------|------|
| コンポーネント定義 | `aidlc-docs/inception/application-design/components.md` |
| メソッドシグネチャ | `aidlc-docs/inception/application-design/component-methods.md` |
| API/DB/インフラ定義 | `aidlc-docs/inception/application-design/services.md` |
| 依存関係・データフロー | `aidlc-docs/inception/application-design/component-dependency.md` |
| 設計Q&A記録 | `aidlc-docs/inception/plans/application-design-plan.md` |

---

## 11. 決勝向け拡張：謝罪中支援（Epic 10 / U9）

### 11.1 コンセプト

「AIが考え、人間が詫びる」Human-in-the-Loop を謝罪の本番中にまで拡張する。  
謝罪ライフサイクル（Before → During → After）のうち、**During**（謝罪中）をカバーすることで、GEZAが謝罪の全フェーズを支援する唯一のAIサービスとなる。

### 11.2 アーキテクチャ拡張図

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ブラウザ（謝罪中支援）                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    DuringSupportPage                                │ │
│  │                                                                     │ │
│  │  ┌──────────────┐  ┌────────────────┐  ┌────────────────────────┐  │ │
│  │  │ AngerGauge   │  │ WhisperAdvisor │  │ DuringSupportDashboard │  │ │
│  │  │ (怒り残量)    │  │ (耳打ち助言)    │  │ (統合ダッシュボード)     │  │ │
│  │  └──────────────┘  └────────────────┘  └────────────────────────┘  │ │
│  └────────────────────────────────┬────────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   共通モジュール（既存）                              │  │
│  │  TranscribeClient │ StateManager │ ApiClient │ AuthModule         │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────┬────────────────────────────────┬──────────────────────────────┘
           │ HTTPS (JWT Auth)               │ WebSocket + 一時認証
           ▼                                ▼
┌──────────────────────┐      ┌──────────────────────────────────────────┐
│   API Gateway        │      │   Amazon Transcribe Streaming            │
│   HTTP API v2        │      │   相手音声ストリーム（怒り残量分析用）      │
│                      │      │   ユーザー音声ストリーム（耳打ちモード用）  │
└──────────┬───────────┘      └──────────────────────────────────────────┘
           │
     ┌─────┴──────────────────────────────────────┐
     │       Lambda 関数（+2本 → 全20本）             │
     │                                               │
     │  Nova Lite 系（追加）                           │
     │  ・analyze-anger         ← 怒り残量リアルタイム分析│
     │  ・detect-danger-speech  ← 危険発言検知・助言生成  │
     └─────┬────────────────────────────────────────┘
           │
           ▼
┌───────────────┐  ┌─────────────────────────────┐
│   DynamoDB    │  │   Amazon Bedrock             │
│   geza-data   │  │   ・Nova Lite (感情分析)      │
│               │  │   （低レイテンシ必須）         │
└───────────────┘  └─────────────────────────────┘
```

### 11.3 フロントエンド追加コンポーネント

#### 新規共通モジュール

| コンポーネント | ファイル | 責務 |
|-------------|---------|------|
| **AngerGauge** | `frontend/shared/anger-gauge.js` | 怒り残量（0〜100%）・失望度・許容余地・反論危険度をリアルタイムゲージ表示。推移データをメモリに蓄積 |
| **WhisperAdvisor** | `frontend/shared/whisper-advisor.js` | 言い訳・逆ギレ・責任転嫁・NGワード検知結果を短い助言として表示。出力インターフェースを抽象化（テキスト/音声/将来デバイス） |

#### 新規ページ

| コンポーネント | ファイル | 対応Journey / US | 責務 |
|-------------|---------|-----------------|------|
| **DuringSupportPage** | `frontend/pages/during-support.html` + `during-support.js` | Journey 10 / US-1001〜1003 | 謝罪中支援統合画面。相手音声→怒り残量分析、ユーザー音声→危険発言検知、統合ダッシュボード表示、セッション終了後サマリー生成 |

### 11.4 バックエンド追加コンポーネント

#### Lambda 関数（+2本）

| # | 関数名 | Bedrockモデル | メモリ | Timeout | 責務 |
|---|--------|-------------|--------|---------|------|
| 19 | **analyze-anger** | Nova Lite | 512MB | 10s | 相手の発言テキストから怒り残量・失望度・許容余地・反論危険度を推定 |
| 20 | **detect-danger-speech** | Nova Lite | 512MB | 10s | ユーザーの発話テキストから言い訳・逆ギレ・責任転嫁・NGワードを検知し、短い助言を生成 |

> **Timeout 10s**: 謝罪中のリアルタイム支援のため、既存 Lambda（30s）より短い応答が必須。Nova Lite の 1〜3 秒応答をプロトタイプで実証済み。

#### プロンプトテンプレート（+2本）

```
backend/prompts/
  analyze-anger.txt         # 怒り残量分析プロンプト
  detect-danger-speech.txt  # 危険発言検知プロンプト
```

### 11.5 API Gateway 追加エンドポイント（+2本）

| メソッド | パス | Lambda | 説明 |
|---------|-----|--------|------|
| **POST** | **`/during/analyze-anger`** | analyze-anger | 相手発言の怒り残量リアルタイム分析 |
| **POST** | **`/during/detect-danger`** | detect-danger-speech | ユーザー発話の危険発言検知・助言生成 |

### 11.6 リクエスト/レスポンス スキーマ

#### POST `/during/analyze-anger`

**Request:**
```json
{
  "opponent_text": "それで済む話だと思っているのか？何度同じことを繰り返すんだ。",
  "opponent_profile": {
    "type": "厳格な上司",
    "anger_level": 70,
    "trust_level": 30
  },
  "conversation_context": [
    { "role": "opponent", "content": "...", "timestamp": "..." },
    { "role": "user", "content": "...", "timestamp": "..." }
  ],
  "session_id": "uuid-v4"
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "anger_remaining": 78,
    "disappointment": 45,
    "tolerance_remaining": 22,
    "counterattack_risk": 65,
    "trend": "rising",
    "summary": "怒りが収まっていません。具体的な再発防止策の提示が必要です。",
    "timestamp": "2026-05-03T14:30:00+09:00"
  }
}
```

#### POST `/during/detect-danger`

**Request:**
```json
{
  "user_text": "いや、それは担当の山田が確認を怠ったせいで...",
  "opponent_profile": {
    "type": "厳格な上司",
    "ng_words": ["忙しくて", "確認不足で"]
  },
  "session_id": "uuid-v4"
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": {
    "dangers_detected": [
      {
        "type": "responsibility_shift",
        "phrase": "担当の山田が確認を怠った",
        "severity": "high",
        "advice": "他人のせいにしています。「チームとしての管理体制に問題があった」に言い換えてください",
        "alternative": "チームとしての確認プロセスに不備がありました"
      }
    ],
    "overall_risk": "high",
    "short_whisper": "責任転嫁！「チームの管理体制」に言い換えて",
    "timestamp": "2026-05-03T14:30:05+09:00"
  }
}
```

### 11.7 DynamoDB 追加アクセスパターン

| パターン | PK | SK | 説明 |
|--------|----|----|------|
| 謝罪中セッション保存 | `USER#<userId>` | `DURING#<timestamp>#<sessionId>` | 謝罪中支援セッションサマリー |
| 怒り残量推移 | `DURING#<sessionId>` | `ANGER#<timestamp>` | 怒り残量・失望度等の時系列データ |
| 危険発言ログ | `DURING#<sessionId>` | `DANGER#<timestamp>` | 検知された危険発言と助言の記録 |

#### 追加属性

```
geza-data（追加属性）
├── sessionType: "DURING"（謝罪中支援セッション識別用）
├── angerRemaining (Number) - 怒り残量 (0-100)
├── disappointment (Number) - 失望度 (0-100)
├── toleranceRemaining (Number) - 許容余地 (0-100)
├── counterattackRisk (Number) - 反論危険度 (0-100)
├── dangerType (String) - "excuse" | "backlash" | "responsibility_shift" | "ng_word"
├── detectedPhrase (String) - 検知されたフレーズ
├── advice (String) - 表示した助言テキスト
└── severity (String) - "low" | "medium" | "high"
```

### 11.8 3層ステート拡張

```
Layer 1: window.AppState（ページ内リアルタイム）追加キー
  angerRemaining: 78      ← 最新の怒り残量
  disappointment: 45      ← 最新の失望度
  toleranceRemaining: 22  ← 最新の許容余地
  counterattackRisk: 65   ← 最新の反論危険度
  angerHistory: [{t, v}]  ← 怒り残量の推移データ
  dangersDetected: [...]  ← 検知済み危険発言一覧
  whisperQueue: [...]     ← 表示待ち助言キュー

Layer 2: sessionStorage 追加キー
  duringSupportSessionId  ← 現在の謝罪中支援セッションID
  opponentStreamActive    ← 相手音声ストリーム状態
  userStreamActive        ← ユーザー音声ストリーム状態
```

### 11.9 フォールバック設計（謝罪中支援）

| 障害シナリオ | フォールバック動作 |
|------------|-----------------|
| Transcribe 接続失敗（相手音声） | テキスト手動入力エリアを表示、相手発言を手入力で怒り残量分析 |
| Transcribe 接続失敗（ユーザー音声） | 耳打ちモード無効化通知、テキスト入力のみで対応 |
| analyze-anger タイムアウト | 前回の分析結果を維持、「分析中...」表示 |
| detect-danger-speech タイムアウト | 危険発言検知をスキップ、次回発話で再試行 |
| 両ストリーム同時接続不可 | 相手音声優先、ユーザー発話はテキスト入力にフォールバック |

### 11.10 将来デバイス構想

イヤホンやARグラスとの連携により、対面謝罪中にリアルタイムで耳元に助言が届く体験を想定。  
`WhisperAdvisor` の出力インターフェースを以下の3モードで抽象化：

```javascript
// 出力モード（将来拡張を想定した抽象化）
const OUTPUT_MODE = {
  TEXT: 'text',           // 画面テキスト表示（MVP）
  AUDIO: 'audio',         // Polly音声読み上げ（決勝デモ）
  DEVICE: 'device'        // 外部デバイス連携（将来）
};
```

Inception段階では `TEXT` モードのみ実装し、`AUDIO` / `DEVICE` は出力インターフェースの定義にとどめる。
