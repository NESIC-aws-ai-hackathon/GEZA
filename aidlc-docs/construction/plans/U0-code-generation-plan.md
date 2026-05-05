# U0 Code Generation 計画

> AI-DLC CONSTRUCTION Phase — Code Generation (Part 1: Planning)  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）  
> 設計根拠: Functional Design（4ファイル）+ NFR Design（2ファイル）+ Infrastructure Design（2ファイル）

---

## ステップ一覧

- [x] Step 1: ユニットコンテキスト分析
- [x] Step 2: コード生成計画作成（このファイル）
- [x] Step 3: ユニット生成コンテキスト定義
- [x] Step 4: 計画ファイル保存
- [x] Step 5: 計画サマリー提示
- [ ] Step 6: 承認前 audit.md ログ
- [ ] Step 7: ユーザー承認待ち
- [ ] Step 8: 承認記録
- [ ] Step 9: aidlc-state.md 更新

**--- Part 2: Generation ---**

- [ ] Step 10: template.yaml 生成（SAM 全リソース定義）
- [ ] Step 11: backend/shared/ — decorators.py
- [ ] Step 12: backend/shared/ — input_validator.py
- [ ] Step 13: backend/shared/ — bedrock_client.py
- [ ] Step 14: backend/shared/ — prompt_loader.py
- [ ] Step 15: backend/shared/ — structured_logger.py
- [ ] Step 16: backend/shared/requirements.txt
- [ ] Step 17: backend/functions/ — Lambda スタブ（23本）
- [ ] Step 18: backend/functions/ — get-job-status Lambda（実装）
- [ ] Step 19: backend/functions/ — bedrock-dispatcher Lambda（実装）
- [ ] Step 20: backend/prompts/ — プロンプトテンプレート（プレースホルダー版、17ファイル）
- [ ] Step 21: frontend/shared/ — auth.js
- [ ] Step 22: frontend/shared/ — api.js（pollJob 含む）
- [ ] Step 23: frontend/shared/ — state.js
- [ ] Step 24: frontend/shared/ — avatar.js
- [ ] Step 25: frontend/shared/ — emotions.js（200感情 15カテゴリ定義）
- [ ] Step 26: frontend/shared/ — anger-gauge.js
- [ ] Step 27: frontend/shared/ — whisper-advisor.js
- [ ] Step 28: frontend/index.html（エントリポイント）
- [ ] Step 29: テストファイル — input_validator.py（Hypothesis PBT）
- [ ] Step 30: テストファイル — emotions.js（fast-check PBT）
- [ ] Step 31: samconfig.toml（SAM デプロイ設定）
- [ ] Step 32: change-log.md 作成
- [ ] Step 33: 完了メッセージ提示

---

## ユニットコンテキスト（Step 3）

### 責務
U0 は個別ドメインロジックを持たない。  
**全ユニット（U1〜U9）が利用する横断的基盤コードとインフラスタブを構築する。**

### 実装スコープ

| カテゴリ | 内容 |
|---------|-----|
| インフラ | `template.yaml`（SAM / 全リソース定義）|
| バックエンド共通 | `backend/shared/`（decorators / input_validator / bedrock_client / prompt_loader / structured_logger）|
| Lambda スタブ | 21本（fast 7 + standard 2 + premium trigger 8 + non-bedrock 4）スタブ実装 |
| Lambda 実装 | 2本（get-job-status / bedrock-dispatcher）完全実装 |
| プロンプト | 17ファイル（プレースホルダー版、各ユニットで詳細実装）|
| フロントエンド共通 | `frontend/shared/`（auth / api / state / avatar / emotions / anger-gauge / whisper-advisor）|
| フロントエンド | `frontend/index.html`（エントリポイント）|
| テスト | PBT テスト（Hypothesis / fast-check）|

### ユーザーストーリー
U0 はインフラ基盤・共通処理 ユニット。直接対応するユーザーストーリーはないが、全ストーリーの前提条件となる。

### 依存関係
- **U0 は他ユニットに依存しない**（最上位基盤）
- U1〜U9 は全て U0 の完了を前提とする

### AWS リソース（Infrastructure Design より）

| リソース | 名称 |
|---------|-----|
| SAM スタック | `geza-app` |
| DynamoDB | `geza-data` |
| SQS | `geza-async-jobs` + `geza-async-jobs-dlq` |
| S3（静的） | `geza-static-XXXXXXXXXXXX-ap-northeast-1` |
| S3（プロンプト） | `geza-prompts-XXXXXXXXXXXX-ap-northeast-1` |
| CloudFront | OAC + SPA フォールバック（CustomErrorResponses）|
| Cognito | User Pool（パスワード12文字 / MFA必須 / 管理者のみ作成）+ Identity Pool |
| Lambda Layer | `geza-shared`（Python 3.12 / arm64）|

---

## 各ステップの詳細

### Step 10: template.yaml（SAM 全リソース定義）

**出力先**: `template.yaml`（ワークスペースルート）

- **含む内容**:
  - `Globals:` — Python 3.12 / arm64 / geza-shared Layer / 全共通環境変数
  - `GezaSharedLayer` — Lambda Layer（backend/shared/）
  - `GezaDataTable` — DynamoDB（geza-data / On-Demand / SSE-DynamoDB / TTL有効）
  - `GezaAsyncJobsQueue` + `GezaAsyncJobsDlq` — SQS（VisTimeout=70s / DLQ 14日 / MaxReceive=3）
  - `GezaStaticBucket` + `GezaPromptsBucket` — S3 2本（パブリックアクセスブロック全有効）
  - `GezaStaticBucketPolicy` / `GezaPromptsBucketPolicy` — S3バケットポリシー
  - `GezaCloudFrontOAC` — CloudFront OAC（sigv4）
  - `GezaResponseHeadersPolicy` — セキュリティヘッダー（SECURITY-04）
  - `GezaDistribution` — CloudFront（OAC / SPAフォールバック / HTTP2 / Redirect to HTTPS）
  - `GezaUserPool` + `GezaUserPoolClient` — Cognito（パスワード12文字 / MFA必須 TOTP / 管理者作成）
  - `GezaIdentityPool` + `GezaIdentityPoolAuthRole` — Cognito Identity Pool（Transcribe用）
  - `GezaHttpApi` — API Gateway HTTP API v2（JWT Authorizer / CORS / throttling）
  - `GezaApiAccessLogGroup` — CloudWatch Logs（API GW / 7日）
  - Lambda 23本（fast 7 + standard 2 + premium trigger 8 + non-bedrock 4 + 新規 2）
  - CloudWatch LogGroup × 23本（7日保持）
  - `Outputs:` — CloudFrontUrl / ApiEndpoint / UserPoolId / UserPoolClientId / IdentityPoolId / DynamoDBTableName / SQSQueueUrl / StaticBucketName / PromptsBucketName
- **セキュリティ**: SECURITY-01〜14 全対応（暗号化 / 認証 / アクセスブロック / ヘッダー / IAM最小権限 / HTTPS強制）
- **ストーリー対応**: U0 基盤（全ストーリーの前提）

---

### Step 11: decorators.py

**出力先**: `backend/shared/decorators.py`

- `@handle_errors` デコレーター（全 Lambda ハンドラーに適用）
- エラー種別: ValidationError(400) / BedrockThrottleError(503) / Exception(500)
- スタックトレースを本番レスポンスに含めない（SECURITY-09）
- CORS ヘッダー: `ALLOWED_ORIGIN` 環境変数から取得（ワイルドカード禁止・SECURITY-08）
- 構造化ログ出力（`structured_logger.py` 利用）

---

### Step 12: input_validator.py

**出力先**: `backend/shared/input_validator.py`

- `validate(body, schema)` — required / 型 / 文字数(2000) / インジェクション検知
- `INJECTION_PATTERNS` — 10パターンの正規表現ブロックリスト
- `htmlescape()` — 全 str フィールドに適用（XSS-01 / SECURITY-05）
- `ValidationError` 例外クラス
- **PBT テスト対象**: Hypothesis で 3プロパティ invariant テスト（Step 29 で生成）

---

### Step 13: bedrock_client.py

**出力先**: `backend/shared/bedrock_client.py`

- `call(model_profile, messages, system_prompt, max_tokens)` — Converse API ラッパー
- `MODEL_IDS` マップ: fast/standard/premium → モデルID
- 指数バックオフリトライ: 1s → 2s → 4s（最大3回）（RETRY-03準拠）
- `ThrottlingException / ServiceUnavailableException` → リトライ
- その他例外（AccessDeniedException 等）→ 即時送出
- `BedrockThrottleError` 例外クラス
- リージョン: `BEDROCK_REGION` 環境変数（デフォルト: `ap-northeast-1`）

---

### Step 14: prompt_loader.py

**出力先**: `backend/shared/prompt_loader.py`

- `load(name, variables)` — `{{variable_name}}` 形式テンプレート展開
- Lambda Layer パス: `/opt/python/prompts/{name}.txt` からの読み込み
- `PromptNotFoundError` / `PromptRenderError` 例外クラス
- 未定義変数が残存する場合は `PromptRenderError`

---

### Step 15: structured_logger.py

**出力先**: `backend/shared/structured_logger.py`

- `get_structured_logger(request_id)` — JSON 構造化ログ出力
- CloudWatch Logs で解析可能な形式: `{"timestamp": ..., "level": ..., "message": ..., "request_id": ...}`
- 個人情報・シークレットをログに含めない（SECURITY-09）

---

### Step 16: backend/shared/requirements.txt

**出力先**: `backend/shared/requirements.txt`

```
boto3>=1.34.0
hypothesis>=6.100.0   # PBT テスト用（ローカル実行時）
```

---

### Step 17: Lambda スタブ（21本）

**出力先**: `backend/functions/<name>/lambda_function.py`（各21ファイル）

- 全スタブは同一パターン:
  ```python
  import json
  from shared.decorators import handle_errors
  from shared.input_validator import validate

  @handle_errors
  def lambda_handler(event, context):
      # TODO: U{N} で実装予定
      return {"statusCode": 200, "body": json.dumps({"message": "stub"}, ensure_ascii=False)}
  ```
- **対象 Lambda**:
  - assess-apology / evaluate-apology / probe-incident
  - generate-opponent / generate-story / generate-feedback / generate-prevention / generate-follow-mail / analyze-reply / diagnose-tendency / generate-guidance-feedback
  - generate-plan
  - text-to-speech / save-session / get-karte / analyze-karte / evaluate-guidance / check-draft / save-story-log
  - detect-danger-speech / analyze-anger
- `@handle_errors` デコレーターを必ず付与（スタブでも SECURITY 準拠）

---

### Step 18: get-job-status Lambda（完全実装）

**出力先**: `backend/functions/get-job-status/lambda_function.py`

- `userId = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]`
- `jobId = event["pathParameters"]["jobId"]`
- DynamoDB `GetItem`: PK=`USER#<userId>`, SK=`JOB#<jobId>`, ConsistentRead=True
- アイテムが存在しない → 404
- `status` / `result` / `errorMessage` / `createdAt` / `updatedAt` を返却
- セキュリティ: userId は JWT クレームから取得（URL パラメータ由来を信頼しない / SECURITY-02）

---

### Step 19: bedrock-dispatcher Lambda（完全実装）

**出力先**: `backend/functions/bedrock-dispatcher/lambda_function.py`

- SQS イベントレコードを1件ずつ処理
- `functionType` → `prompt_loader.load()` → `bedrock_client.call()`
- DynamoDB: 処理開始時に `status=PROCESSING`、完了後 `status=COMPLETED/FAILED`
- `result` フィールドに Bedrock レスポンス JSON を格納
- エラー時: `status=FAILED`, `errorMessage` にメッセージ格納
- `ReportBatchItemFailures` 対応（個別メッセージ失敗を DLQ へ）

---

### Step 20: プロンプトテンプレート（17ファイル）

**出力先**: `backend/prompts/*.txt`

各ファイルは `{{variable_name}}` 形式のプレースホルダーを持つ最小限のテンプレート。  
実際のプロンプト内容は各ユニット（U1〜U9）のコード生成ステージで詳細化する。

**生成対象**:
```
assess-apology.txt / evaluate-apology.txt / probe-incident.txt
generate-opponent.txt / generate-story.txt / generate-plan.txt
generate-feedback.txt / generate-prevention.txt / generate-follow-mail.txt
analyze-karte.txt / evaluate-guidance.txt / generate-guidance-feedback.txt
check-draft.txt / analyze-reply.txt / diagnose-tendency.txt
analyze-anger.txt / detect-danger-speech.txt
```

---

### Step 21: auth.js

**出力先**: `frontend/shared/auth.js`

- `AuthModule` クラス（設計: frontend-components.md Section 1）
- Cognito User Pool / Identity Pool 操作（Amazon Cognito SDK または fetch 経由）
- `init()` / `signIn()` / `signOut()` / `getIdToken()` / `refreshTokens()` / `getCurrentUser()`
- セキュリティ: `sessionStorage` のみ（`localStorage` / Cookie 禁止 / AUTH-05）
- `data-testid` 属性: `login-email-input` / `login-password-input` / `login-submit-button`
- XSS 対策: DOM 操作はすべて `textContent` 使用（`innerHTML` 禁止 / SECURITY-10）

---

### Step 22: api.js

**出力先**: `frontend/shared/api.js`

- `ApiClient` クラス（設計: frontend-components.md Section 2）
- `post()` / `get()` — JWT Authorization ヘッダー付与
- 401 時の自動リフレッシュ + キューイング
- **`pollJob(jobId, options)` 追加**（NFR Design: 指数バックオフポーリング）
  - `maxWaitMs=60000` / `maxIntervalMs=5000` / バックオフ 1s→2s→4s→5s→5s...
  - `COMPLETED` → 結果返却 / `FAILED` → `ApiError` / タイムアウト → `ApiError(408)`
- `ApiError` クラス（`statusCode / message / requestId`）

---

### Step 23: state.js

**出力先**: `frontend/shared/state.js`

- `StateManager` クラス（設計: frontend-components.md Section 3）
- `setAppState` / `getAppState` — `window.AppState` に読み書き
- `setSessionState` / `getSessionState` / `getSessionField` — `sessionStorage` に JSON シリアライズ
- `resetAppState` / `clearSessionState`
- **PBT テスト対象**: Round-trip プロパティ（Step 30 で生成）

---

### Step 24: avatar.js

**出力先**: `frontend/shared/avatar.js`

- `AvatarController` クラス（設計: frontend-components.md Section 4）
- `init()` / `setCategoryEmotion()` / `setEmotion()` / `stopAnimation()` / `exportConfig()`
- facesjs フォーク版 IIFE バンドル（`frontend/assets/facesjs.min.js`）を利用
- CSS Custom Properties で感情アニメーション制御
- タイマー管理: `setInterval` / `clearInterval`（前のタイマーを必ずクリア）
- DOM 挿入: `textContent` 使用（`innerHTML` 禁止 / SECURITY-10）

---

### Step 25: emotions.js

**出力先**: `frontend/shared/emotions.js`

- `EmotionDefinitions` シングルトン（設計: frontend-components.md Section 5）
- `pickRandomInCategory(categoryId, prevEmotionId)` — 重み付きランダム + 連続回避
- `getEmotionsByCategory(categoryId)` / `getEmotionById(emotionId)` / `getAllCategories()`
- **200感情 × 15カテゴリの定義データ**（application-design/components.md の設計に準拠）
- **PBT テスト対象**: 2プロパティ invariant（Step 30 で生成）

---

### Step 26: anger-gauge.js

**出力先**: `frontend/shared/anger-gauge.js`

- `AngerGauge` クラス
- `update(value)` — 0〜100 の怒り残量をゲージ表示
- DOM 操作: `textContent` / `style.setProperty` 使用（`innerHTML` 禁止 / SECURITY-10）
- `data-testid="anger-gauge-bar"` / `data-testid="anger-gauge-value"` を付与

---

### Step 27: whisper-advisor.js

**出力先**: `frontend/shared/whisper-advisor.js`

- `WhisperAdvisor` クラス
- `show(message)` — アドバイスメッセージを耳打ち表示（アニメーション）
- `hide()` — 非表示
- DOM 操作: `textContent` 使用（`innerHTML` 禁止 / SECURITY-10）
- `data-testid="whisper-advisor-message"` を付与

---

### Step 28: frontend/index.html

**出力先**: `frontend/index.html`

- ログイン画面のエントリポイント（SPA のルート）
- `<script type="module">` で auth.js / api.js / state.js を読み込み
- `data-testid` 属性付与（`login-form` / `login-email-input` / `login-password-input` / `login-submit-button`）
- CSP メタタグ不要（CloudFront Response Headers Policy で設定）
- `textContent` で DOM 操作（`innerHTML` 禁止）

---

### Step 29: テスト — input_validator.py（Hypothesis PBT）

**出力先**: `backend/tests/test_input_validator.py`

- Hypothesis `@given` で 3 invariant テスト:
  1. 有効スキーマ準拠入力は常に通過する
  2. インジェクションパターン入力は常に `ValidationError`
  3. 2001文字以上の str フィールドは常に `ValidationError`

---

### Step 30: テスト — emotions.js / state.js（fast-check PBT）

**出力先**: `frontend/tests/test_emotions.js`

- fast-check `fc.assert` で:
  - `EmotionDefinitions.pickRandomInCategory`: 2 invariant プロパティ
  - `StateManager` 3層 round-trip プロパティ

---

### Step 31: samconfig.toml

**出力先**: `samconfig.toml`（ワークスペースルート）

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "geza-app"
region = "ap-northeast-1"
confirm_changeset = false
capabilities = "CAPABILITY_IAM CAPABILITY_NAMED_IAM"
resolve_s3 = true
```

---

### Step 32: change-log.md

**出力先**: `aidlc-docs/construction/U0/code/change-log.md`

---

## コード品質ルール（全ステップ共通）

| ルール | 内容 |
|-------|-----|
| **XSS-01** | フロントエンドの DOM 挿入は `textContent` のみ（`innerHTML` 禁止）|
| **SECURITY-05** | 全 Lambda は `input_validator.validate()` を通過した入力のみを処理 |
| **SECURITY-09** | スタックトレース・内部パスをレスポンスに含めない |
| **SECURITY-10** | `innerHTML` 使用禁止 |
| **AUTH-05** | トークンは `sessionStorage` のみ（`localStorage` / Cookie 禁止）|
| **PBT-01** | `input_validator.py` と `EmotionDefinitions` は Hypothesis / fast-check でテスト |
| **data-testid** | インタラクティブ要素に `data-testid` を付与 |
| **コメント** | 既存コードに変更なき箇所へのコメント追加不要 |

---

## ストーリートレーサビリティ

U0 は基盤ユニットのためユーザーストーリーなし。  
完了後、全ストーリー（U1〜U9 / 271SP）のインフラ前提条件が満たされる。
