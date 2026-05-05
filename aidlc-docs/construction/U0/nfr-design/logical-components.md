# U0 論理コンポーネント定義

> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 全体アーキテクチャ概要

```
[フロントエンド - S3 + CloudFront]
  |  index.html: Cache-Control: no-cache
  |  *.js/*.css: Cache-Control: max-age=31536000
  |
  |  HTTPS / Cognito JWT
  |
[API Gateway HTTP API v2]
  | burst=100 / rate=20
  | Cognito JWT Authorizer（全 EP）
  | 統合タイムアウト: 29s（premium）/ 10s（fast）/ 30s（standard）
  |
  ├─ fast / standard / non-bedrock Lambda (21本の一部)
  |     ├─ input_validator.py (SECURITY-05)
  |     ├─ bedrock_client.py (fast/standard)
  |     └─ DynamoDB / Polly 直接呼び出し
  |
  ├─ premium trigger Lambda (8本: 既存 premium Lambda を転用)
  |     ├─ input_validator.py → jobId 生成 → DynamoDB PENDING 書き込み
  |     └─ SQS送信 → { jobId } を即返却
  |
  ├─ GET /jobs/{jobId} → get-job-status Lambda (NEW: +1)
  |     └─ DynamoDB: JOB#<jobId> 取得 → status/result 返却
  |
[Amazon SQS - geza-async-jobs]
  | Visibility Timeout: 70s / MaxReceiveCount: 3
  | Dead-Letter Queue: geza-async-jobs-dlq (保持14日)
  |
[bedrock-dispatcher Lambda (NEW: +1 / SQS トリガー)]
  | function_type に基づいてプロンプト・モデル決定
  | Bedrock Converse API (Claude Sonnet, 60s タイムアウト)
  | DynamoDB: COMPLETED / FAILED 書き込み
  |
[Amazon DynamoDB - geza-data (シングルテーブル)]
  | USER#<userId> | SESSION#<...> | TURN#<...> | JOB#<jobId>
  | SSE-DynamoDB 暗号化 / On-Demand / TTL on job entries
  |
[Amazon Bedrock - ap-northeast-1]
  | fast:     amazon.nova-lite-v1:0
  | standard: anthropic.claude-haiku-4-5-v1:0
  | premium:  anthropic.claude-sonnet-4-5-v1:0 (bedrock-dispatcher から)
  |
[Amazon Cognito]
  | User Pool: JWT 発行
  | Identity Pool: Transcribe WebSocket 用 STS 認証
  |
[Amazon Polly / Transcribe]
  | Polly: text-to-speech Lambda から呼び出し (ap-northeast-1)
  | Transcribe: フロントエンド WebSocket (Cognito Identity Pool 経由)
```

---

## 論理コンポーネント一覧

### 1. API Gateway HTTP API v2

| 属性 | 値 |
|-----|---|
| タイプ | HTTP API v2（REST API ではない） |
| 認証 | Cognito JWT Authorizer（全エンドポイント） |
| CORS | `ALLOWED_ORIGIN` 環境変数で管理 |
| スロットリング | デフォルト: burst=100 / rate=20 req/s |
| ログ | アクセスログ → CloudWatch Logs（7日保持） |
| 統合タイムアウト | fast EP=10s / standard EP=30s / premium EP=29s |

### 2. Lambda 共通 Layer（geza-shared）

| 属性 | 値 |
|-----|---|
| パス | `backend/shared/` |
| 主要モジュール | `decorators.py` / `input_validator.py` / `bedrock_client.py` / `prompt_loader.py` |
| ランタイム | Python 3.12 |
| SAM管理 | `AWS::Serverless::LayerVersion`（デプロイ時自動更新） |
| 保持ポリシー | Delete（古いバージョン自動削除） |

### 3. Lambda 関数群

#### 3.1 fast Lambda（256MB / 10s / Nova Lite）

| Lambda 名 | エンドポイント | 主処理 |
|-----------|------------|------|
| evaluate-attitude | POST /apology/assess | 謝罪角度算出 |
| check-apology | POST /apology/evaluate | 謝罪評価・感情分類 |
| classify-incident | POST /incident/probe | インシデント分類 |
| check-draft | POST /draft/check | 文面炎上リスクチェック |
| classify-karte | GET /karte/analyze | カルテ傾向分類 |
| classify-prevention | POST /prevention/generate（分類フェーズ） | 防止策分類 |
| classify-follow | POST /mail/generate（分類フェーズ） | フォロー分類 |
| evaluate-guidance | POST /guidance/evaluate | 指導評価 |
| analyze-anger | POST /during/analyze-anger | 怒り残量リアルタイム分析 |
| detect-danger-speech | POST /during/detect-danger | 危険発言検知 |

#### 3.2 standard Lambda（512MB / 30s / Claude Haiku 4.5）

| Lambda 名 | エンドポイント | 主処理 |
|-----------|------------|------|
| probe-incident | POST /incident/probe | 深掘り分析 |
| generate-plan | POST /plan/generate | 謝罪プラン生成 |

#### 3.3 premium trigger Lambda（256MB / 10s / trigger のみ）

| Lambda 名 | エンドポイント | SQS functionType |
|-----------|------------|----------------|
| generate-opponent | POST /opponent/generate | `generate-opponent` |
| generate-story | POST /story/generate | `generate-story` |
| generate-feedback | POST /feedback/generate | `generate-feedback` |
| generate-prevention | POST /prevention/generate | `generate-prevention` |
| generate-follow-mail | POST /mail/generate | `generate-follow-mail` |
| analyze-reply | POST /reply/analyze | `analyze-reply` |
| diagnose-tendency | GET /karte/diagnose | `diagnose-tendency` |
| guidance-feedback | POST /guidance/feedback | `guidance-feedback` |

> **trigger Lambda の処理**: ①入力バリデーション ②jobId生成 ③DynamoDB PENDING書き込み ④SQS送信 ⑤`{"jobId": "<uuid>", "status": "PENDING"}` 即返却

#### 3.4 non-bedrock Lambda（256MB / 10s）

| Lambda 名 | エンドポイント | 主処理 |
|-----------|------------|------|
| save-session | POST /sessions | DynamoDB セッション保存 |
| get-karte | GET /karte, GET /karte/{sessionId} | DynamoDB カルテ取得 |
| text-to-speech | POST /tts/synthesize | Polly 音声合成 |

#### 3.5 新規 Lambda（+2本）

| Lambda 名 | エンドポイント | メモリ | タイムアウト | 主処理 |
|-----------|------------|------|-----------|------|
| **get-job-status** | GET /jobs/{jobId} | 256MB | 10s | DynamoDB JOB# 取得・返却 |
| **bedrock-dispatcher** | —（SQSトリガー） | 1024MB | 60s | function_type によるBedrock呼び出し振り分け |

### 4. Amazon SQS

| コンポーネント | 名前 | 設定 |
|-------------|-----|------|
| メインキュー | `geza-async-jobs` | Standard Queue / Visibility Timeout=70s / Message Retention=4日 |
| Dead-Letter Queue | `geza-async-jobs-dlq` | 保持期間=14日 / MaxReceiveCount=3 |

> **Visibility Timeout=70s**: bedrock-dispatcher のタイムアウト（60s）より長く設定し、  
> 正常処理中にメッセージが再取得されないようにする。

### 5. Amazon DynamoDB（geza-data）

| アクセスパターン | PK | SK | ConsistentRead |
|--------------|----|----|---------------|
| ジョブ状態取得 | `USER#<userId>` | `JOB#<jobId>` | **True** |
| セッション保存後取得 | `USER#<userId>` | `SESSION#<createdAt>` | **True** |
| カルテ一覧 | `USER#<userId>` | `SESSION#` (prefix) | False |
| ターン取得 | `USER#<userId>` | `TURN#<sessionId>#<n>` | False |

**ジョブエントリ（JOB# SK）追加定義**:

```
PK:            USER#<userId>
SK:            JOB#<jobId>
status:        PENDING | PROCESSING | COMPLETED | FAILED
functionType:  generate-opponent | ...
result:        JSON string（COMPLETED 時）
errorMessage:  string（FAILED 時）
ttl:           <unix_timestamp>（24時間後、DynamoDB TTL で自動削除）
createdAt:     ISO 8601
updatedAt:     ISO 8601
```

### 6. Amazon CloudFront + S3

| コンポーネント | 設定 |
|-------------|-----|
| S3 バケット | 静的ウェブサイトホスティング。パブリックアクセスブロック有効（CF OAC 経由のみ） |
| CloudFront OAC | Origin Access Control（OAI は非推奨のため OAC を使用） |
| Response Headers Policy | SECURITY-04 準拠（CSP / HSTS / X-Content-Type / X-Frame-Options / Referrer-Policy） |
| キャッシュ設定 | index.html TTL=0 / *.js, *.css, *.svg TTL=31536000 |
| カスタムエラーページ | 403/404 → /index.html（SPA フォールバック） |
| デプロイ後無効化 | `/index.html`, `/*/index.html` を Invalidation |

### 7. Amazon Cognito

| コンポーネント | 設定 |
|-------------|-----|
| User Pool | パスワードポリシー強（8文字+大小英数記号） / MFA=OPTIONAL / メール確認必須 |
| App Client | Hosted UI + PKCE フロー / IdToken=1時間 / RefreshToken=30日 |
| Identity Pool | Transcribe Streaming 用 STS 一時認証情報取得 |

### 8. AWS Lambda Layer（geza-shared）依存関係

```
backend/shared/
  __init__.py
  decorators.py      ← @handle_errors デコレーター
  input_validator.py ← バリデーション + インジェクション検知 + HTMLエスケープ
  bedrock_client.py  ← Converse API ラッパー + 指数バックオフリトライ
  prompt_loader.py   ← プロンプトテンプレート読み込み
  structured_logger.py ← CloudWatch 構造化ログ

backend/prompts/     ← Lambda Layer に含める
  generate-opponent.txt
  generate-story.txt
  ... (各 premium/standard Lambda 用テンプレート)
```

---

## Lambda 本数サマリー

| カテゴリ | 変更前 | 変更後 | 変更内容 |
|---------|-------|-------|---------|
| fast（Nova Lite） | 8本 | **7本** | analyze-anger + detect-danger-speech を fast へ確定（analyze-karte は fast 計算に含む）|
| standard（Haiku 4.5） | 2本 | 2本 | 変更なし |
| premium trigger（Sonnet） | 8本 | 8本 | 既存を trigger として流用 |
| non-bedrock | 3本 | **4本** | save-story-log を追加（将来実装）|
| 新規追加 | — | 2本 | bedrock-dispatcher + get-job-status |
| **合計** | **21本** | **23本** | Infrastructure Design で確定（fast=7 / non-bedrock=4）|

---

## IAM ポリシー追加（新規コンポーネント対応）

### bedrock-dispatcher Lambda IAM

```yaml
- Effect: Allow
  Action: [sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes]
  Resource: !GetAtt GezaAsyncJobsQueue.Arn
- Effect: Allow
  Action: [bedrock:InvokeModel]
  Resource:
    - arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-4-5-v1:0
- Effect: Allow
  Action: [dynamodb:UpdateItem, dynamodb:GetItem]
  Resource: !GetAtt GezaTable.Arn
```

### premium trigger Lambda IAM（追加分）

```yaml
- Effect: Allow
  Action: [sqs:SendMessage]
  Resource: !GetAtt GezaAsyncJobsQueue.Arn
- Effect: Allow
  Action: [dynamodb:PutItem]
  Resource: !GetAtt GezaTable.Arn
```

### get-job-status Lambda IAM

```yaml
- Effect: Allow
  Action: [dynamodb:GetItem]
  Resource: !GetAtt GezaTable.Arn
```
