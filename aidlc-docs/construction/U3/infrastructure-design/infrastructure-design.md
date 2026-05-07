# U3 Infrastructure Design
> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-07  
> 対象ユニット: U3（リハーサルモード）  
> ステータス: 承認待ち

---

## 概要

U3 で必要なインフラ変更は最小限。**Cognito Identity Pool は U0 時点で template.yaml に実装済み**のため、新規 AWS リソースの追加は不要。  
変更対象は `GenerateFeedbackFunction` の Lambda 設定（スタブ設定 → premium プロファイル）のみ。

---

## 1. 既存インフラ確認（変更なし）

| リソース | 状態 | 備考 |
|---------|:---:|------|
| `GezaIdentityPool` | ✅ デプロイ済み | AllowUnauthenticatedIdentities: false（Q6: A 準拠）|
| `GezaIdentityPoolAuthRole` | ✅ デプロイ済み | `transcribe:StartStreamTranscriptionWebSocket` 権限付与済み |
| `GezaIdentityPoolRoles` | ✅ デプロイ済み | 認証済みロール紐付け済み |
| `IdentityPoolId` Output | ✅ デプロイ済み | Outputs に `IdentityPoolId` として出力済み |
| `EvaluateApologyFunction` | ✅ 設定正しい | 256MB / 10s / Bedrock + S3 Prompts 権限 ✅ |
| `TextToSpeechFunction` | ✅ 設定正しい | 256MB / 10s / `polly:SynthesizeSpeech` 権限 ✅ |

---

## 2. template.yaml 変更（GenerateFeedbackFunction）

### 変更前（スタブ設定）
```yaml
GenerateFeedbackFunction:
  MemorySize: 256
  Timeout: 10
  Policies:
    - Statement:
        - Action: [dynamodb:PutItem]
          Resource: !GetAtt GezaDataTable.Arn
        - Action: sqs:SendMessage
          Resource: !GetAtt GezaAsyncJobsQueue.Arn
```

### 変更後（U3 premium 本実装）
```yaml
GenerateFeedbackFunction:
  MemorySize: 1024
  Timeout: 29
  Policies:
    - Statement:
        - Action: [bedrock:InvokeModel, bedrock:Converse]
          Resource: "*"
        - Action: s3:GetObject
          Resource: !Sub "${GezaPromptsBucket.Arn}/*"
```

**変更理由**:
- generate-feedback は Claude Sonnet（premium）を使用するため 1024MB / 29s が必要
- DynamoDB / SQS 権限は不要（U3 では会話履歴を DynamoDB 保存しない）
- Bedrock + S3 Prompts 権限を追加

---

## 3. フロントエンド成果物（S3 sync 対象）

| ファイル | S3 パス | 備考 |
|---------|---------|------|
| `frontend/pages/practice.html` | `pages/practice.html` | 新規 |
| `frontend/pages/practice.js` | `pages/practice.js` | 新規 |
| `frontend/pages/feedback.html` | `pages/feedback.html` | 新規 |
| `frontend/pages/feedback.js` | `pages/feedback.js` | 新規 |
| `frontend/shared/transcribe.js` | `shared/transcribe.js` | 新規 |
| `frontend/shared/polly-sync.js` | `shared/polly-sync.js` | 新規 |
| `frontend/shared/auth.js` | `shared/auth.js` | 更新（getCognitoIdentityCredentials 追加）|
| `frontend/shared/state.js` | `shared/state.js` | 更新（practice ネームスペース追加）|
| `frontend/pages/top.js` | `pages/top.js` | 更新（リハーサルモード available=true 確認）|

---

## 4. バックエンドプロンプト（S3 sync 対象）

| ファイル | S3 パス | 備考 |
|---------|---------|------|
| `backend/prompts/evaluate_apology.txt` | `evaluate_apology.txt` | 新規（本番プロンプト） |
| `backend/prompts/generate_feedback.txt` | `generate_feedback.txt` | 新規（本番プロンプト） |

---

## 5. デプロイ手順

### Step 1: SAM ビルド＆デプロイ（GenerateFeedbackFunction 設定変更）

```powershell
# C:\Temp\geza-src から実行（OneDrive WinError 426 回避）
cd C:\Temp\geza-src
$env:PATH = "C:\Users\oono.toshiki\AppData\Local\Programs\Python\Python313;$env:PATH"

sam build --parallel --build-dir "C:\Temp\geza-build2"

sam deploy --profile share --no-confirm-changeset --resolve-s3 `
  --stack-name geza-app `
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
  --region ap-northeast-1 `
  --build-dir "C:\Temp\geza-build2"
```

**期待する変更セット**:
- `GenerateFeedbackFunction`: UPDATE（1024MB / 29s / Bedrock+S3 権限）

### Step 2: S3 フロントエンド同期

```powershell
aws s3 sync frontend/ s3://geza-static-890236016419-ap-northeast-1/ `
  --profile share --region ap-northeast-1 `
  --cache-control "no-cache,no-store" `
  --exclude "*.DS_Store"
```

### Step 3: S3 プロンプト同期

```powershell
aws s3 sync backend/prompts/ s3://geza-prompts-890236016419-ap-northeast-1/ `
  --profile share --region ap-northeast-1
```

### Step 4: CloudFront Invalidation

```powershell
aws cloudfront create-invalidation `
  --distribution-id E1AZPLEM19ABKQ `
  --paths "/*" `
  --profile share --no-verify-ssl
```

---

## 6. スモークテスト期待値

| テスト | 期待値 |
|-------|-------|
| `POST /apology/evaluate`（JWT なし） | HTTP 401 ✅ |
| `POST /tts/synthesize`（JWT なし） | HTTP 401 ✅ |
| `POST /feedback/generate`（JWT なし） | HTTP 401 ✅ |
| `practice.html`（CloudFront 経由） | HTTP 200 |
| `feedback.html`（CloudFront 経由） | HTTP 200 |
| `shared/transcribe.js`（CloudFront 経由） | HTTP 200 |
| `shared/polly-sync.js`（CloudFront 経由） | HTTP 200 |
| `aws lambda get-function-configuration --function-name generate-feedback`（Memory/Timeout確認） | 1024MB / 29s |

---

## 7. セキュリティコンプライアンス確認

| ID | 項目 | 状態 |
|---|------|:---:|
| SECURITY-01 | Cognito JWT 必須 | ✅ 全エンドポイント適用済み（U0） |
| SECURITY-04 | セキュリティヘッダー | ✅ CloudFront Response Headers Policy（U0） |
| SECURITY-06 | S3 バケット非公開 | ✅ CloudFront OAC 経由のみ（U0） |
| SECURITY-07 | IAM 最小権限 | ✅ generate-feedback: Bedrock + S3 Prompts のみ |
| SECURITY-09 | Transcribe 権限最小化 | ✅ StartStreamTranscriptionWebSocket のみ |
