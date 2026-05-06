# U2 インフラストラクチャ設計
> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-06  
> 対象ユニット: U2（コンシェルジュコア）  
> ステータス: 承認待ち

---

## 1. 設計サマリー

| 項目 | 決定値 |
|-----|-------|
| 新規 AWS リソース | **なし**（全リソースは U0 デプロイ済み） |
| template.yaml 変更 | **あり**（Lambda 2本の設定修正） |
| sam deploy 実行 | **必要**（Lambda 設定変更 + 実装コード反映） |
| フロントエンド S3 sync | **必要**（inception.html / inception.js / apology-meter.js 等追加） |
| プロンプト S3 sync | **必要**（4ファイルを本番版に更新） |
| CF Invalidation | **必要** |

---

## 2. template.yaml 変更点

### 2.1 GenerateOpponentFunction（変更あり）

**変更理由**: U0 では SQS 非同期パターン想定だったが、U2 FD/NFR で「同期呼び出し（Haiku 4.5 / 512MB / 30s）」に確定。

| 設定項目 | 変更前 | 変更後 |
|---------|:------:|:------:|
| MemorySize | 256 MB | **512 MB** |
| Timeout | 10s | **30s** |
| Policies（Bedrock） | なし | **bedrock:InvokeModel（Haiku 4.5）追加** |
| Policies（SQS） | sqs:SendMessage | **削除** |
| DynamoDB | dynamodb:PutItem | **dynamodb:GetItem / PutItem / Query** |

### 2.2 GeneratePlanFunction（変更あり）

**変更理由**: U0 では Bedrock 直接呼び出し想定だったが、U2 NFR で「SQS 非同期 trigger（256MB / 10s / SQS送信のみ）」に確定。

| 設定項目 | 変更前 | 変更後 |
|---------|:------:|:------:|
| MemorySize | 512 MB | **256 MB** |
| Timeout | 30s | **10s** |
| Policies（Bedrock） | bedrock:InvokeModel（Haiku） | **削除** |
| Policies（SQS） | なし | **sqs:SendMessage 追加** |
| DynamoDB | GetItem / PutItem / Query | **PutItem のみ** |

> `bedrock-dispatcher` が実際の Bedrock 処理を担当（U0 実装済み・変更なし）。

---

## 3. 使用リソース（U0 デプロイ済み・変更なし）

### 3.1 CloudFront Distribution

| 設定項目 | 値 |
|---------|---|
| DistributionId | `E1AZPLEM19ABKQ` |
| ドメイン | `https://dhamuhqye8mp6.cloudfront.net` |
| S3 Origin | `geza-static-<accountId>-ap-northeast-1` |

### 3.2 API Gateway

| 設定項目 | 値 |
|---------|---|
| エンドポイント | `https://h6a2xx1i30.execute-api.ap-northeast-1.amazonaws.com` |
| U2 追加エンドポイント（既存ルート） | `POST /apology/assess` / `POST /incident/probe` / `POST /opponent/generate` / `POST /plan/generate` |

### 3.3 SQS

| キュー | 役割 |
|------|------|
| `geza-async-jobs` | generate-plan trigger が enqueue → bedrock-dispatcher が処理 |
| `geza-async-jobs-dlq` | 3回失敗でDLQ |

### 3.4 DynamoDB テーブル（`geza-data`）

U2 で追加されるアクセスパターン:

| 操作 | PK | SK | Lambda |
|-----|----|----|--------|
| PutItem | `SESSION#<userId>` | `<sessionId>` | save-session |
| UpdateItem | `SESSION#<userId>` | `<sessionId>` | save-session（apology_date更新） |
| PutItem | `JOB#<jobId>` | `METADATA` | generate-plan（trigger） |
| UpdateItem | `JOB#<jobId>` | `METADATA` | bedrock-dispatcher（結果書き込み） |
| GetItem | `JOB#<jobId>` | `METADATA` | get-job-status |

---

## 4. フロントエンドファイル構成（U2 追加・変更）

```
frontend/                          ← aws s3 sync 対象ルート
├── pages/
│   ├── inception.html             【新規】7ステップ HTML
│   └── inception.js               【新規】InceptionPageController（全 Step Controllers）
├── shared/
│   ├── apology-meter.js           【新規】ApologyMeterモジュール（prototype移植）
│   ├── api.js                     【変更】pollJob() 追加
│   └── state.js                   【変更】inception ネームスペース追加
└── (その他のファイルは変更なし)
```

---

## 5. バックエンドファイル構成（U2 実装対象）

```
backend/
├── functions/
│   ├── assess-apology/
│   │   └── lambda_function.py    【実装】スタブ → 本実装（Nova Lite）
│   ├── probe-incident/
│   │   └── lambda_function.py    【実装】スタブ → 本実装（Haiku 4.5）
│   ├── generate-opponent/
│   │   └── lambda_function.py    【実装】スタブ → 本実装（Haiku 4.5）
│   └── generate-plan/
│       └── lambda_function.py    【実装】スタブ → 本実装（SQS trigger）
└── prompts/
    ├── assess_apology.txt         【更新】本番版プロンプト
    ├── probe_incident.txt         【更新】本番版プロンプト
    ├── generate_opponent.txt      【更新】本番版プロンプト
    └── generate_plan.txt          【更新】本番版プロンプト（bedrock-dispatcher から使用）
```

---

## 6. デプロイ手順

### 6.1 template.yaml 修正

上記 2.1 / 2.2 の変更を template.yaml に適用（Code Generation フェーズで実施）。

### 6.2 sam build & deploy

```powershell
# Python パス設定（必要な場合）
$env:PATH = "C:\Users\oono.toshiki\AppData\Local\Programs\Python\Python313;$env:PATH"

# バリデーション
sam validate

# ビルド
sam build --parallel

# デプロイ
sam deploy --profile share --no-confirm-changeset --resolve-s3 `
  --stack-name geza-app `
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
  --region ap-northeast-1
```

### 6.3 フロントエンド S3 sync

```powershell
# S3 バケット名（実際の accountId に置き換え）
aws s3 sync frontend/ s3://geza-static-XXXXXXXXXXXX-ap-northeast-1/ `
  --delete --profile share --region ap-northeast-1
```

### 6.4 プロンプト S3 sync

```powershell
aws s3 sync backend/prompts/ s3://geza-prompts-XXXXXXXXXXXX-ap-northeast-1/ `
  --profile share --region ap-northeast-1
```

### 6.5 CloudFront Invalidation

```powershell
aws cloudfront create-invalidation `
  --distribution-id E1AZPLEM19ABKQ `
  --paths "/*" --profile share --no-verify-ssl
```

---

## 7. スモークテスト手順

```powershell
# Stack Outputs から URL 取得
$outputs = aws cloudformation describe-stacks --stack-name geza-app `
  --profile share --region ap-northeast-1 `
  --query "Stacks[0].Outputs" --output json | ConvertFrom-Json

$api = ($outputs | Where-Object OutputKey -eq "ApiEndpoint").OutputValue
$cf  = ($outputs | Where-Object OutputKey -eq "CloudFrontDomain").OutputValue

# 1. APIエンドポイント疎通（401 → Lambda + API GW 正常）
Invoke-WebRequest -Uri "$api/apology/assess" -Method POST -UseBasicParsing | Select-Object StatusCode

# 2. CloudFront 疎通（200 → inception.html 到達確認）
Invoke-WebRequest -Uri "$cf/pages/inception.html" -UseBasicParsing | Select-Object StatusCode

# 3. Lambda 設定確認
aws lambda get-function-configuration --function-name generate-plan `
  --profile share --region ap-northeast-1 `
  --query "{Memory:MemorySize,Timeout:Timeout}" --output json

aws lambda get-function-configuration --function-name generate-opponent `
  --profile share --region ap-northeast-1 `
  --query "{Memory:MemorySize,Timeout:Timeout}" --output json
```

**期待値**:
- `/apology/assess` POST → 401
- `inception.html` → 200
- `generate-plan` → `{"Memory": 256, "Timeout": 10}`
- `generate-opponent` → `{"Memory": 512, "Timeout": 30}`

---

## U2-EXT: 追加インフラ（2026-05-06 予定外追加）

### 追加 AWS リソース（デプロイ済み）

| リソース | 種別 | 設定 |
|---------|------|------|
| `ConsultPlanFunction` | Lambda | 256MB / 30s / `POST /plan/consult` / Haiku 4.5 |
| `ConsultPlanLogGroup` | CloudWatch Logs | `/aws/lambda/consult-plan` / 7日保持 |
| `ConsultPlanFunctionRole` | IAM Role | `bedrock:InvokeModel` / `s3:GetObject`（prompts） |
| `ConsultPlanFunctionApiPermission` | Lambda::Permission | API GW からの invoke 許可 |

### template.yaml 追加定義

```yaml
ConsultPlanFunction:
  Type: AWS::Serverless::Function
  Properties:
    FunctionName: consult-plan
    Handler: lambda_function.lambda_handler
    CodeUri: backend/functions/consult-plan/
    MemorySize: 256
    Timeout: 30
    Policies:
      - Statement:
          - Effect: Allow
            Action: bedrock:InvokeModel
            Resource: "*"
          - Effect: Allow
            Action: s3:GetObject
            Resource: !Sub "arn:aws:s3:::geza-prompts-${AWS::AccountId}-${AWS::Region}/*"
    Events:
      Api:
        Type: HttpApi
        Properties:
          ApiId: !Ref GezaHttpApi
          Method: POST
          Path: /plan/consult
          Auth:
            Authorizer: CognitoAuthorizer

ConsultPlanLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: /aws/lambda/consult-plan
    RetentionInDays: 7
```

### デプロイ確認（実施済み）

```
CREATE_COMPLETE  ConsultPlanLogGroup
CREATE_COMPLETE  ConsultPlanFunctionRole
CREATE_COMPLETE  ConsultPlanFunction
UPDATE_COMPLETE  GezaHttpApi
CREATE_COMPLETE  ConsultPlanFunctionApiPermission
UPDATE_COMPLETE  geza-app (stack)
```

### S3アップロード（実施済み）

| ファイル | バケット |
|---------|---------|
| `frontend/pages/inception.html` | `geza-static-XXXXXXXXXXXX-ap-northeast-1/pages/inception.html` |
| `frontend/pages/inception.js` | `geza-static-XXXXXXXXXXXX-ap-northeast-1/pages/inception.js` |
| `frontend/style.css` | `geza-static-XXXXXXXXXXXX-ap-northeast-1/style.css` |
| `backend/prompts/consult_plan.txt` | `geza-prompts-XXXXXXXXXXXX-ap-northeast-1/consult_plan.txt` |

### U2-EXT スモークテスト結果（2026-05-06）

| テスト | 期待値 | 結果 |
|-------|-------|------|
| `POST /plan/consult` | 401（Cognito保護） | ✅ PASS |
| CloudFront TOP | 200 | ✅ PASS |
| DynamoDB `geza-data` | ACTIVE | ✅ PASS |
