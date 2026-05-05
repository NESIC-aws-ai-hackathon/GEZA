# Unit of Work 依存関係マトリックス

> AI-DLC INCEPTION - Units Generation 成果物  
> 生成日: 2026-04-30

---

## ユニット間依存マトリックス

行 = 依存元（必要とする側）、列 = 依存先（必要とされる側）  
● = 必須依存、○ = 任意依存（成果物の一部を再利用）

|  | U0 インフラ | U1 トップ+認証 | U2 コンシェルジュ | U3 練習 | U4 支援+カルテ | U5 ストーリー | U6 上司 |
|--|:-----------:|:-------------:|:----------------:|:------:|:--------------:|:------------:|:------:|
| **U0 インフラ** | — | | | | | | |
| **U1 トップ+認証** | ● | — | | | | | |
| **U2 コンシェルジュ** | ● | ● | — | | | | |
| **U3 練習** | ● | ● | ○ | — | | | |
| **U4 支援+カルテ** | ● | ● | ○ | ● | — | | |
| **U5 ストーリー** | ● | ● | | ● | | — | |
| **U6 上司モード** | ● | ● | | ○ | | | — |

---

## 依存関係詳細

### U1 → U0（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AuthModule (auth.js) | Cognito サインアップ/ログイン/ログアウト |
| StateManager (state.js) | ページ内ステート管理 |
| AvatarController (avatar.js) | トップ画面アバター表示 |
| Cognito User Pool（インフラ） | JWT トークン発行・検証 |
| S3 + CloudFront（インフラ） | 静的ファイル配信 |

---

### U2 → U0（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| ApiClient (api.js) | `/apology/assess` `/opponent/generate` `/plan/generate` 呼び出し |
| StateManager (state.js) | やらかし入力・相手プロフィールのステート管理 |
| AvatarController (avatar.js) | 謝罪相手アバター表示・カスタマイズ |
| input_validator.py | ユーザー入力サニタイズ（全Lambda共通） |
| bedrock_client.py | Nova Lite / Claude Sonnet 呼び出し |
| prompt_loader.py | プロンプトテンプレート読み込み |
| Lambda スタブ × 3（assess/opponent/plan） | U2 で本実装に置き換え |

### U2 → U1（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AuthModule (auth.js) | 認証ガード（未ログインリダイレクト） |
| sessionStorage（ログイン状態） | US-201 開始前提 |

---

### U3 → U0（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AvatarController (avatar.js) | 練習中のアバター感情表現・viseme口パク |
| EmotionDefinitions (emotions.js) | 200感情・15カテゴリ CSS transform・エフェクト・カテゴリ内ランダム選択 |
| ApiClient (api.js) | `/apology/evaluate` `/tts/synthesize` 呼び出し |
| StateManager (state.js) | 怒り度/信頼度/会話ターンのリアルタイム管理 |
| Lambda スタブ × 2（evaluate/tts） | U3 で本実装に置き換え |
| Cognito Identity Pool（インフラ） | Transcribe Streaming 一時認証情報 |

### U3 → U1（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AuthModule | 認証ガード |

### U3 → U2（任意・sessionStorage 経由）

| 依存コンポーネント | 用途 |
|-----------------|------|
| `bossProfile` (sessionStorage) | U2 で生成した相手プロフィールを練習セッション開始時に利用 |
| `avatarSeed` (sessionStorage) | U2 で生成したアバターシードを practice 画面で復元 |

> **注意**: U3 は U2 に直接コード依存しない。sessionStorage を介したデータ連携のため、U2 未使用でも独立して動作可能（US-401: 相手プロフィールが sessionStorage にあれば OK）。

---

### U4 → U0（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| ApiClient (api.js) | `/feedback/generate` `/prevention/generate` `/mail/generate` `/sessions` `/karte` 呼び出し |
| StateManager (state.js) | カルテ表示用ステート |
| Lambda スタブ × 6（feedback/prevention/mail/save/get-karte/analyze） | U4 で本実装に置き換え |
| DynamoDB（インフラ） | セッション保存・カルテ読み込み |

### U4 → U1（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AuthModule | 認証ガード・userId 取得 |

### U4 → U3（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| FeedbackPage HTML (feedback.html) | U3 で作成済みの HTML に支援機能セクションを追加 |
| sessionStorage（セッション結果） | U3 の練習結果を U4 のフィードバック/支援生成に利用 |

### U4 → U2（任意・sessionStorage 経由）

| 依存コンポーネント | 用途 |
|-----------------|------|
| `planData` (sessionStorage) | U2 で生成したプランをカルテ保存時に含める（任意） |

---

### U5 → U0（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| ApiClient (api.js) | `/story/generate` 呼び出し |
| Lambda スタブ（generate-story） | U5 で本実装に置き換え |

### U5 → U1（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AuthModule | 認証ガード |

### U5 → U3（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| PracticePage (practice.html/practice.js) | ストーリーモードで練習画面を共有利用 |
| sessionStorage（bossProfile） | GenerateStoryLambda のボスプロフィールを練習画面に渡す |

---

### U6 → U0（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| ApiClient (api.js) | `/guidance/evaluate` `/guidance/feedback` `/tts/synthesize` `/sessions` 呼び出し |
| AvatarController (avatar.js) | 部下役アバター感情表現 |
| StateManager (state.js) | 建設性スコア・部下感情のリアルタイム管理 |
| Lambda スタブ × 2（guidance-eval/guidance-feedback） | U6 で本実装に置き換え |

### U6 → U1（必須）

| 依存コンポーネント | 用途 |
|-----------------|------|
| AuthModule | 認証ガード |

### U6 → U3（任意）

| 依存コンポーネント | 用途 |
|-----------------|------|
| TextToSpeechLambda（U3で実装済み） | US-702 の部下役音声発話（`/tts/synthesize` を再利用） |
| TranscribeClient (transcribe.js)（U3で実装済み） | 音声入力（任意機能として再利用） |
| PollySyncController (polly-sync.js)（U3で実装済み） | 音声再生 + viseme 同期（再利用） |

---

## 実装順序フロー

```
U0 (インフラ基盤 + FEコア)
  │  SAM一括デプロイ（全Lambda スタブ）
  │  AuthModule / ApiClient / StateManager / AvatarController
  ▼
U1 (トップ + 認証)
  │  Cognito 認証フロー動作確認
  │  TopPage 動作確認
  ▼
U2 (コンシェルジュコア)
  │  角度アセスメント → 相手生成 → プラン生成 → 実施日管理
  │  ApologyMeter SVG 動作確認
  ▼
U3 (練習シミュレーション)
  │  アバター対話 + Polly TTS + Transcribe
  │  200感情表現（15カテゴリ内ランダム遷移） + viseme 口パク確認
  ▼
U4 (謝罪後支援 + カルテ)
  │  フィードバック/再発防止策/フォローメール生成
  │  DynamoDB 保存 + カルテ閲覧
  ▼
U5 (ストーリーモード) [任意・U3完了後]
  │  ストーリー生成 + ボス選択
  ▼
U6 (上司モード) [時間が余れば]
     指導練習 + 部下役AI対話
```

---

## 共有インフラ依存（全ユニット共通）

| インフラコンポーネント | 全ユニット共通の依存 |
|--------------------|-------------------|
| API Gateway HTTP API v2 | 全 Lambda エンドポイントのルーティング |
| Cognito JWT Authorizer | 全エンドポイントの認証 |
| DynamoDB (geza-data) | U4 で本格利用（U0 で構築済み） |
| S3 (prompts/) | 全 Lambda のプロンプト読み込み |
| CloudFront + S3 | フロントエンド配信 |
| shared-utils-layer | decorators.py / input_validator.py / prompt_loader.py / bedrock_client.py |
