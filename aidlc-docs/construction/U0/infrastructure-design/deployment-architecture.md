# U0 デプロイアーキテクチャ

> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 1. デプロイアーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────┐
│  開発者ローカル環境                                                      │
│                                                                     │
│  $ sam build                                                        │
│  $ sam deploy --stack-name geza-app --resolve-s3 --profile share   │
│  $ aws s3 sync frontend/ s3://geza-static-XXXXXXXXXXXX-ap-...      │
└────────────────────────┬────────────────────────────────────────────┘
                         │ SAM / AWS CLI
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AWS CloudFormation（geza-app スタック）                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  S3: geza-static-XXXXXXXXXXXX-ap-northeast-1                │   │
│  │    frontend/ ← index.html, *.js, *.css, *.svg               │   │
│  │    （パブリックアクセスブロック有効 / CloudFront OAC 経由のみ）        │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │ CloudFront OAC（sigv4）                 │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │  CloudFront Distribution                                    │   │
│  │    Default: CachingOptimized（TTL=1年、*.js/*.css/*.svg）      │   │
│  │    /index.html: CachingDisabled（TTL=0）                     │   │
│  │    Response Headers Policy（CSP/HSTS/X-Frame/等）            │   │
│  │    redirect-to-https                                        │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │ HTTPS（xxxxx.cloudfront.net）           │
│                           ▼                                        │
│  ┌──────── エンドユーザー ブラウザ ──────────────────────────────────┐   │
│  │                                                             │   │
│  │  [認証フロー]                                                │   │
│  │  Cognito User Pool ← JWT → API Gateway（全EP）               │   │
│  │  Cognito Identity Pool ← STS → Transcribe WebSocket        │   │
│  │                                                             │   │
│  │  [同期フロー（fast / standard）]                              │   │
│  │  Browser → API GW → Lambda → Bedrock → レスポンス            │   │
│  │                                                             │   │
│  │  [非同期フロー（premium）]                                     │   │
│  │  Browser → API GW → trigger Lambda → SQS → dispatcher      │   │
│  │         ← jobId 即返却                           ↓           │   │
│  │  Browser → GET /jobs/{jobId} → get-job-status Lambda        │   │
│  │         （指数バックオフ: 1s→2s→4s→5s→5s→... maxWait=60s）   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  API Gateway HTTP API v2                                    │   │
│  │    スロットリング: burst=100 / rate=20 req/s                  │   │
│  │    Cognito JWT Authorizer（全 23 EP）                         │   │
│  │    CORS: AllowOrigins = CloudFront DomainName               │   │
│  └────────────┬──────────────────┬──────────────────┬──────────┘   │
│               │ fast/standard     │ premium trigger   │ non-bedrock │
│               ▼                   ▼                   ▼            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐    │
│  │  fast Lambda × 7 │  │ premium trigger  │  │ non-bedrock   │    │
│  │  256MB / 10s     │  │ Lambda × 8本     │  │ Lambda × 4本  │    │
│  │  Nova Lite       │  │ 256MB / 10s      │  │ 256MB / 10s   │    │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬────────┘   │
│           │                     │ SQS                │            │
│  ┌────────▼──────────┐  ┌───────▼────────┐  ┌───────▼────────┐   │
│  │ standard Lambda×2 │  │ geza-async-    │  │ DynamoDB       │   │
│  │ 512MB / 30s       │  │ jobs（SQS）     │  │ geza-data      │   │
│  │ Claude Haiku 4.5  │  │ VisTimeout=70s │  │ On-Demand      │   │
│  └────────┬──────────┘  └───────┬────────┘  └──────┬────────┘   │
│           │                     │ SQS trigger       │            │
│           │              ┌──────▼────────┐          │            │
│           │              │ bedrock-      │          │            │
│           │              │ dispatcher    │          │            │
│           │              │ 1024MB / 60s  │          │            │
│           │              │ Claude Sonnet │          │            │
│           │              └──────┬────────┘          │            │
│           │                     │ DLQ（3回失敗）      │            │
│           │              ┌──────▼────────┐          │            │
│           │              │ geza-async-   │          │            │
│           │              │ jobs-dlq      │          │            │
│           │              └───────────────┘          │            │
│           │                                         │            │
│  ┌────────▼─────────────────────────────────────────▼────────┐   │
│  │  Amazon Bedrock（ap-northeast-1）                          │   │
│  │    Nova Lite: fast Lambda 用                               │   │
│  │    Claude Haiku 4.5: standard Lambda 用                   │   │
│  │    Claude Sonnet 4.5: bedrock-dispatcher 用                │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  S3: geza-prompts-XXXXXXXXXXXX-ap-northeast-1               │   │
│  │    *.txt ← プロンプトテンプレート（全 Lambda 共用）              │   │
│  │    （Lambda IAM ロールのみ GetObject 許可）                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  CloudWatch Logs                                            │   │
│  │    /aws/apigateway/geza-http-api（7日）                     │   │
│  │    /aws/lambda/<function-name> × 23本（7日）                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. ディレクトリ構成（Code Generation 後の完成形）

```
GEZA/
├── template.yaml                    # SAM テンプレート（シングルファイル）
├── samconfig.toml                   # SAM デプロイ設定（自動生成）
│
├── backend/
│   ├── shared/                      # Lambda Layer（geza-shared）
│   │   ├── decorators.py
│   │   ├── input_validator.py
│   │   ├── bedrock_client.py
│   │   ├── prompt_loader.py
│   │   ├── structured_logger.py
│   │   └── requirements.txt
│   │
│   ├── prompts/                     # S3 geza-prompts バケットにアップロード
│   │   ├── assess-apology.txt
│   │   ├── evaluate-apology.txt
│   │   ├── probe-incident.txt
│   │   ├── generate-opponent.txt
│   │   ├── generate-story.txt
│   │   ├── generate-plan.txt
│   │   ├── generate-feedback.txt
│   │   ├── generate-prevention.txt
│   │   ├── generate-follow-mail.txt
│   │   ├── analyze-karte.txt
│   │   ├── evaluate-guidance.txt
│   │   ├── generate-guidance-feedback.txt
│   │   ├── check-draft.txt
│   │   ├── analyze-reply.txt
│   │   ├── diagnose-tendency.txt
│   │   ├── analyze-anger.txt
│   │   ├── detect-danger-speech.txt
│   │   └── bedrock-dispatcher.txt   # dispatcher 共通設定（各functionType別プロンプトから呼ばれる）
│   │
│   └── functions/
│       ├── assess-apology/lambda_function.py
│       ├── evaluate-apology/lambda_function.py
│       ├── probe-incident/lambda_function.py
│       ├── generate-opponent/lambda_function.py
│       ├── generate-story/lambda_function.py
│       ├── generate-plan/lambda_function.py
│       ├── text-to-speech/lambda_function.py
│       ├── generate-feedback/lambda_function.py
│       ├── generate-prevention/lambda_function.py
│       ├── generate-follow-mail/lambda_function.py
│       ├── save-session/lambda_function.py
│       ├── get-karte/lambda_function.py
│       ├── analyze-karte/lambda_function.py
│       ├── evaluate-guidance/lambda_function.py
│       ├── generate-guidance-feedback/lambda_function.py
│       ├── check-draft/lambda_function.py
│       ├── analyze-reply/lambda_function.py
│       ├── save-story-log/lambda_function.py
│       ├── diagnose-tendency/lambda_function.py
│       ├── analyze-anger/lambda_function.py
│       ├── detect-danger-speech/lambda_function.py
│       ├── get-job-status/lambda_function.py    # 新規
│       └── bedrock-dispatcher/lambda_function.py  # 新規
│
└── frontend/
    ├── index.html                   # S3 geza-static にアップロード
    ├── shared/
    │   ├── auth.js                  # AuthModule
    │   ├── api.js                   # ApiClient（pollJob 含む）
    │   ├── state.js                 # StateManager
    │   ├── avatar.js                # AvatarController
    │   ├── emotions.js              # EmotionDefinitions
    │   ├── anger-gauge.js           # AngerGauge
    │   └── whisper-advisor.js       # WhisperAdvisor
    └── assets/
        └── facesjs.min.js           # facesjs フォーク版 IIFE バンドル
```

---

## 3. SAM デプロイコマンド

### 3.1 初回デプロイ

```powershell
# 前提: aws sso login --profile share 完了済み

# ビルド
sam build --profile share

# デプロイ（初回 --guided で samconfig.toml を生成）
sam deploy --guided --profile share
# プロンプトへの入力値:
#   Stack Name: geza-app
#   AWS Region: ap-northeast-1
#   Confirm changes: Y
#   Allow SAM CLI IAM role creation: Y
#   Save arguments to samconfig.toml: Y
```

### 3.2 2回目以降のデプロイ

```powershell
sam build --profile share
sam deploy --profile share  # samconfig.toml の設定を使用
```

### 3.3 フロントエンドのデプロイ

```powershell
# S3 静的ファイルアップロード
aws s3 sync frontend/ s3://geza-static-XXXXXXXXXXXX-ap-northeast-1/ --profile share

# プロンプトファイルアップロード
aws s3 sync backend/prompts/ s3://geza-prompts-XXXXXXXXXXXX-ap-northeast-1/ --profile share

# CloudFront Invalidation（デプロイ後に必ず実行）
$distributionId = (aws cloudformation describe-stacks `
  --stack-name geza-app `
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" `
  --output text `
  --profile share)

aws cloudfront create-invalidation `
  --distribution-id $distributionId `
  --paths "/*" `
  --profile share
```

### 3.4 スタック削除（ロールバック用）

```powershell
# ⚠️ 注意: 全リソース削除。DynamoDB データも消える
sam delete --stack-name geza-app --profile share
```

---

## 4. デプロイ後の動作確認手順

### 4.1 SAM スタック出力確認

```powershell
aws cloudformation describe-stacks `
  --stack-name geza-app `
  --query "Stacks[0].Outputs" `
  --output table `
  --profile share
# 確認項目:
#   CloudFrontUrl: https://xxxxx.cloudfront.net
#   ApiEndpoint:   https://xxxxx.execute-api.ap-northeast-1.amazonaws.com
#   UserPoolId:    ap-northeast-1_XXXXXXXXX
#   UserPoolClientId: xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4.2 Cognito ユーザー作成（管理者操作）

```powershell
# ユーザー作成
aws cognito-idp admin-create-user `
  --user-pool-id <UserPoolId> `
  --username <test-email@example.com> `
  --user-attributes Name=email,Value=<test-email@example.com> Name=email_verified,Value=true `
  --temporary-password "TempPass12!" `
  --profile share

# TOTP MFA 設定はユーザーが初回ログイン時にアプリで実施
```

### 4.3 API 動作確認（curl）

```bash
# ① Cognito JWT 取得（初回パスワード変更後）
ACCESS_TOKEN="<Cognito AccessToken>"

# ② fast Lambda（assess-apology）テスト
curl -X POST \
  https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/apology/assess \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"incident_summary":"テスト","categories":"社内","relationship":"上司","deadline":"明日"}' \
  | python -m json.tool

# 期待レスポンス: {"ai_degree": <0-180>, "stage_name": "...", ...}

# ③ premium trigger Lambda（generate-opponent）テスト
curl -X POST \
  https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/opponent/generate \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"incident_summary":"テスト","categories":"社内","relationship":"上司"}' \
  | python -m json.tool

# 期待レスポンス: {"jobId": "<uuid>", "status": "PENDING"}

# ④ ポーリング（get-job-status）テスト
JOB_ID="<jobId from above>"
curl -X GET \
  "https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/jobs/$JOB_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | python -m json.tool

# 期待レスポンス（PENDING/PROCESSING/COMPLETED/FAILED）
```

### 4.4 Lambda ログ確認

```powershell
# 直近のログ確認
aws logs tail /aws/lambda/assess-apology --follow --profile share
aws logs tail /aws/lambda/bedrock-dispatcher --follow --profile share
```

### 4.5 DynamoDB 確認

```powershell
# JOB# エントリ確認
aws dynamodb get-item `
  --table-name geza-data `
  --key '{"PK": {"S": "USER#<userId>"}, "SK": {"S": "JOB#<jobId>"}}' `
  --consistent-read `
  --profile share
```

---

## 5. 環境変数確認スクリプト

```powershell
# 全 Lambda の環境変数一覧確認
$functions = aws lambda list-functions `
  --query "Functions[?starts_with(FunctionName, 'assess-')].FunctionName" `
  --output text `
  --profile share

# 個別確認
aws lambda get-function-configuration `
  --function-name assess-apology `
  --query "Environment.Variables" `
  --output table `
  --profile share
```

---

## 6. デプロイ後 Outputs 一覧

| Output キー | 値 | 用途 |
|------------|---|-----|
| `CloudFrontUrl` | `https://xxxxx.cloudfront.net` | フロントエンド URL |
| `CloudFrontDistributionId` | `EXXXXXXXXXXXXX` | Invalidation 用 |
| `ApiEndpoint` | `https://xxxxx.execute-api.ap-northeast-1.amazonaws.com` | API ベース URL |
| `UserPoolId` | `ap-northeast-1_XXXXXXXXX` | Cognito 設定 |
| `UserPoolClientId` | `xxxxxxxxxxxxxxxxxxxxxxxxxx` | フロントエンド設定（`auth.js`）|
| `IdentityPoolId` | `ap-northeast-1:xxxxxxxx-xxxx-...` | Transcribe 用（`auth.js`）|
| `DynamoDBTableName` | `geza-data` | 確認用 |
| `SQSQueueUrl` | `https://sqs.ap-northeast-1.amazonaws.com/XXXXXXXXXXXX/geza-async-jobs` | 確認用 |
| `StaticBucketName` | `geza-static-XXXXXXXXXXXX-ap-northeast-1` | デプロイ用 |
| `PromptsBucketName` | `geza-prompts-XXXXXXXXXXXX-ap-northeast-1` | デプロイ用 |
