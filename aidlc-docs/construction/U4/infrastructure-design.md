# U4 Infrastructure Design
> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-10  
> 対象ユニット: U4（謝罪後支援 + カルテ）  
> ステータス: 承認済み

---

## 1. 設計サマリー

U4 は既存 `geza-app` SAM スタック（U0〜U3 デプロイ済み）への **差分追加** のみ。
新規スタック・新規バケット・新規 Cognito リソースは不要。

| 区分 | 変更内容 |
|-----|---------|
| **Lambda（新規）** | `generate-prevention` / `generate-follow-mail` / `get-karte` / `analyze-karte` の4本 |
| **Lambda（更新）** | `save-session`（_SCHEMA_UPDATE 拡張） |
| **API Gateway** | 4エンドポイント追加（`/prevention/generate` / `/mail/generate` / `/karte` GET / `/karte/analyze` GET） |
| **S3 prompts bucket** | `generate_prevention.txt` / `generate_follow_mail.txt` / `analyze_karte.txt` の3ファイル追加 |
| **S3 static bucket** | `feedback-detail.html/js` / `carte.html/js` / `case-detail.html/js`（更新）追加 |
| **DynamoDB** | スキーマ変更なし（属性追加は save-session Lambda 側で対応） |
| **Cognito / CloudFront / SQS** | 変更なし |

---

## 2. template.yaml 差分（疑似コード）

> **注意**: 既存リソース（GezaSharedLayer / GezaDataTable / GezaUserPool / GezaDistribution 等）は省略。  
> AWSアカウントID は `XXXXXXXXXXXX`（12桁プレースホルダー）で記載する。

```yaml
# ─────────────────────────────────────────────
# U4 新規追加リソース
# ─────────────────────────────────────────────

  # generate-prevention Lambda
  GeneratePreventionFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: generate-prevention
      CodeUri: backend/functions/generate-prevention/
      Handler: lambda_function.lambda_handler
      MemorySize: 1024
      Timeout: 29
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref GezaDataTable
        - Statement:
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource: "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-*"
        - S3ReadPolicy:
            BucketName: !Sub "geza-prompts-${AWS::AccountId}-${AWS::Region}"
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: POST
            Path: /prevention/generate
            Auth:
              Authorizer: CognitoAuthorizer

  # generate-follow-mail Lambda
  GenerateFollowMailFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: generate-follow-mail
      CodeUri: backend/functions/generate-follow-mail/
      Handler: lambda_function.lambda_handler
      MemorySize: 1024
      Timeout: 29
      Policies:
        - Statement:
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource: "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-*"
        - S3ReadPolicy:
            BucketName: !Sub "geza-prompts-${AWS::AccountId}-${AWS::Region}"
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: POST
            Path: /mail/generate
            Auth:
              Authorizer: CognitoAuthorizer

  # get-karte Lambda
  GetKarteFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: get-karte
      CodeUri: backend/functions/get-karte/
      Handler: lambda_function.lambda_handler
      MemorySize: 256
      Timeout: 10
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref GezaDataTable
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: GET
            Path: /karte
            Auth:
              Authorizer: CognitoAuthorizer

  # analyze-karte Lambda
  AnalyzeKarteFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: analyze-karte
      CodeUri: backend/functions/analyze-karte/
      Handler: lambda_function.lambda_handler
      MemorySize: 256
      Timeout: 10
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref GezaDataTable
        - Statement:
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource: "arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-*"
        - S3ReadPolicy:
            BucketName: !Sub "geza-prompts-${AWS::AccountId}-${AWS::Region}"
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: GET
            Path: /karte/analyze
            Auth:
              Authorizer: CognitoAuthorizer
```

---

## 3. API Gateway エンドポイント一覧（U4 追加分）

| # | メソッド | パス | Lambda | 認証 | タイムアウト |
|---|---------|------|--------|------|:----------:|
| +1 | POST | `/prevention/generate` | generate-prevention | Cognito JWT | 29s |
| +2 | POST | `/mail/generate` | generate-follow-mail | Cognito JWT | 29s |
| +3 | GET | `/karte` | get-karte | Cognito JWT | 10s |
| +4 | GET | `/karte/analyze` | analyze-karte | Cognito JWT | 10s |

**PUT `/session/update`**（save-session）は U3 から存在。Lambda コード更新のみ（SAM リソース定義変更なし）。

---

## 4. S3 ファイル配置計画

### 4.1 プロンプトバケット（`geza-prompts-XXXXXXXXXXXX-ap-northeast-1`）

| ファイル名 | 配置タイミング | 説明 |
|-----------|:------------:|------|
| `generate_prevention.txt` | Code Generation 完了後 | 再発防止策・チェックリスト生成プロンプト |
| `generate_follow_mail.txt` | Code Generation 完了後 | フォローメール生成プロンプト |
| `analyze_karte.txt` | Code Generation 完了後 | 傾向分析プロンプト（Nova Lite） |

アップロードコマンド:
```powershell
aws s3 cp backend/prompts/generate_prevention.txt `
  s3://geza-prompts-XXXXXXXXXXXX-ap-northeast-1/generate_prevention.txt `
  --profile share --no-verify-ssl

aws s3 cp backend/prompts/generate_follow_mail.txt `
  s3://geza-prompts-XXXXXXXXXXXX-ap-northeast-1/generate_follow_mail.txt `
  --profile share --no-verify-ssl

aws s3 cp backend/prompts/analyze_karte.txt `
  s3://geza-prompts-XXXXXXXXXXXX-ap-northeast-1/analyze_karte.txt `
  --profile share --no-verify-ssl
```

### 4.2 静的バケット（`geza-static-XXXXXXXXXXXX-ap-northeast-1`）

| ファイル | 状態 | 説明 |
|---------|:----:|------|
| `feedback-detail.html` | 新規 | 詳細フィードバック画面 |
| `feedback-detail.js` | 新規 | チェックリスト・防止策・フォローメール制御 |
| `carte.html` | 新規 | カルテ一覧・傾向分析画面 |
| `carte.js` | 新規 | DynamoDB 取得・analyze-karte 表示 |
| `case-detail.html` | 更新 | 「謝罪完了を記録する」ボタン追加 |
| `case-detail.js` | 更新 | 謝罪完了モーダル・actual_result 保存処理追加 |
| `feedback.js` | 更新 | feedback-detail.html へのリンク追加 |

CloudFront Invalidation（デプロイ後）:
```powershell
aws cloudfront create-invalidation `
  --distribution-id E1AZPLEM19ABKQ `
  --paths "/*" --profile share --no-verify-ssl
```

---

## 5. Lambda デプロイ方式（U3 パターン踏襲）

SAM ビルドは使用しない。直接 ZIP アップロード方式を継続。

### 手順テンプレート（新規 Lambda 4本）

```powershell
# 例: generate-prevention
$fn = "generate-prevention"
$buildDir = "C:\Temp\lambda-build\$fn"

New-Item -ItemType Directory -Force -Path $buildDir
Copy-Item "backend\functions\$fn\lambda_function.py" $buildDir
Copy-Item "backend\shared\*" $buildDir -Recurse -Force

Compress-Archive -Path "$buildDir\*" -DestinationPath "C:\Temp\$fn.zip" -Force

aws lambda update-function-code `
  --function-name $fn `
  --zip-file "fileb://C:\Temp\$fn.zip" `
  --profile share --region ap-northeast-1 --no-verify-ssl
```

### 新規 Lambda 初回作成（SAM deploy）

U4 の4新規 Lambda は `template.yaml` に追加後、`sam deploy` で一括作成する。  
（コード更新は以降 ZIP 直接アップロードで対応）

```powershell
sam deploy --profile share --no-confirm-changeset --resolve-s3 `
  --stack-name geza-app `
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
  --region ap-northeast-1
```

---

## 6. スモークテスト計画（デプロイ後）

| テスト | 期待値 | コマンド |
|-------|-------|---------|
| `/prevention/generate` 疎通 | 401 (認証なし) | `Invoke-WebRequest -Uri "$api/prevention/generate" -Method POST -UseBasicParsing` |
| `/mail/generate` 疎通 | 401 | `Invoke-WebRequest -Uri "$api/mail/generate" -Method POST -UseBasicParsing` |
| `/karte` 疎通 | 401 | `Invoke-WebRequest -Uri "$api/karte" -UseBasicParsing` |
| `/karte/analyze` 疎通 | 401 | `Invoke-WebRequest -Uri "$api/karte/analyze" -UseBasicParsing` |
| feedback-detail.html 表示 | 200 | `Invoke-WebRequest -Uri "$cf/feedback-detail.html" -UseBasicParsing` |
| carte.html 表示 | 200 | `Invoke-WebRequest -Uri "$cf/carte.html" -UseBasicParsing` |

---

## 7. セキュリティ確認

| 観点 | 設定 |
|------|------|
| 新規 Lambda IAM | 最小権限（各 Lambda に必要な DynamoDB / Bedrock / S3 のみ付与） |
| API Gateway 認証 | 全4エンドポイントに `CognitoAuthorizer` 設定（`Auth` プロパティ省略禁止） |
| generate-follow-mail | メールアドレス等の個人情報は Lambda を通過せず、フロントで clipboard.writeText() のみ |
| analyze-karte | DynamoDB pk=`USER#{sub}` フィルタにより他ユーザーデータアクセス不可 |
| プロンプトバケット | S3 バケットポリシー: Lambda 実行ロールからの GetObject のみ許可（既存 U0 設定継続） |
