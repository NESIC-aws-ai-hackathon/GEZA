# U0 インフラストラクチャ設計

> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）  
> 設計根拠: Q1=A / Q2=A / Q3=A / Q4=A / Q5=A / Q6=B / Q7=A / Q8=A / Q9=A / Q10=A / Q11=BCB / Q12=A

---

## 1. 設計サマリー

| 項目 | 決定値 |
|-----|-------|
| デプロイツール | AWS SAM（シングル `template.yaml`） |
| スタック名 | `geza-app`（シングルスタック・ステージ分離なし） |
| リージョン | `ap-northeast-1` |
| Lambda 本数 | **23本**（元21本 + bedrock-dispatcher + get-job-status） |
| S3 バケット | **2本**（`geza-static-<accountId>-<region>` / `geza-prompts-<accountId>-<region>`） |
| Cognito | パスワード12文字以上・MFA必須（TOTP）・管理者のみ作成 |
| 監視 | CloudWatch Logs 7日保持（全Lambda）。Alarm / Dashboard なし |
| カスタムドメイン | なし（CloudFront / API GW デフォルトドメイン） |
| SAM Artifacts バケット | `--resolve-s3` で自動作成 |

---

## 2. SAM template.yaml 疑似コード

> **注意**: このファイルは設計仕様書です。実際のコードは Code Generation ステージで生成します。  
> AWSアカウントID は `XXXXXXXXXXXX`（12桁プレースホルダー）で記載します。

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: GEZA - AI謝罪行動支援アプリケーション

# ─────────────────────────────────────────────
# 2.1 Globals（全 Lambda 共通設定）
# ─────────────────────────────────────────────
Globals:
  Function:
    Runtime: python3.12
    Architectures: [arm64]           # Graviton2: Python 3.12 / boto3 完全対応。x86_64比20%コスト削減
    Layers:
      - !Ref GezaSharedLayer
    Environment:
      Variables:
        DYNAMODB_TABLE_NAME: !Ref GezaDataTable
        SQS_QUEUE_URL: !Ref GezaAsyncJobsQueue
        PROMPTS_BUCKET_NAME: !Sub "geza-prompts-${AWS::AccountId}-${AWS::Region}"
        BEDROCK_REGION: ap-northeast-1
        ALLOWED_ORIGIN: !Sub "https://${GezaDistribution.DomainName}"
        COGNITO_USER_POOL_ID: !Ref GezaUserPool
    Tracing: PassThrough  # X-Ray（ハッカソンスコープでは無効）

Resources:

  # ─────────────────────────────────────────────
  # 2.2 Lambda Layer（geza-shared）
  # ─────────────────────────────────────────────
  GezaSharedLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: geza-shared
      Description: "GEZA 共通モジュール（decorators / input_validator / bedrock_client / prompt_loader）"
      ContentUri: backend/shared/
      CompatibleRuntimes: [python3.12]
      RetentionPolicy: Delete  # 古いバージョン自動削除
    Metadata:
      BuildMethod: python3.12

  # ─────────────────────────────────────────────
  # 2.3 DynamoDB（geza-data）
  # ─────────────────────────────────────────────
  GezaDataTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: geza-data
      BillingMode: PAY_PER_REQUEST  # On-Demand（Q5 NFR）
      SSESpecification:
        SSEEnabled: true
        SSEType: AES256             # SSE-DynamoDB AWSマネージドキー（SECURITY-01）
      AttributeDefinitions:
        - { AttributeName: PK, AttributeType: S }
        - { AttributeName: SK, AttributeType: S }
      KeySchema:
        - { AttributeName: PK, KeyType: HASH }
        - { AttributeName: SK, KeyType: RANGE }
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true               # JOB# エントリ 24時間後自動削除

  # ─────────────────────────────────────────────
  # 2.4 SQS（非同期ジョブキュー）
  # ─────────────────────────────────────────────
  GezaAsyncJobsDlq:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: geza-async-jobs-dlq
      MessageRetentionPeriod: 1209600  # 14日

  GezaAsyncJobsQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: geza-async-jobs
      VisibilityTimeout: 70            # bedrock-dispatcher タイムアウト(60s) + バッファ
      MessageRetentionPeriod: 345600   # 4日
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt GezaAsyncJobsDlq.Arn
        maxReceiveCount: 3             # 3回失敗でDLQへ

  # ─────────────────────────────────────────────
  # 2.5 S3（2バケット構成: Q6=B）
  # ─────────────────────────────────────────────
  GezaStaticBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "geza-static-${AWS::AccountId}-${AWS::Region}"
      PublicAccessBlockConfiguration:  # SECURITY-03
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  GezaPromptsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "geza-prompts-${AWS::AccountId}-${AWS::Region}"
      PublicAccessBlockConfiguration:  # SECURITY-03
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  # Bucket Policy（CloudFront OAC 経由のみ GezaStaticBucket を許可）
  GezaStaticBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref GezaStaticBucket
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub "${GezaStaticBucket.Arn}/*"
            Condition:
              StringEquals:
                AWS:SourceArn: !Sub "arn:aws:cloudfront::${AWS::AccountId}:distribution/${GezaDistribution}"

  # GezaPromptsBucket Policy（Lambda からの GetObject のみ）
  GezaPromptsBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref GezaPromptsBucket
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Sub "arn:aws:iam::${AWS::AccountId}:root"  # Lambda IAM Roles
            Action: s3:GetObject
            Resource: !Sub "${GezaPromptsBucket.Arn}/*"
            # ※ Code Generation ステージで Lambda Role ARN に絞り込む

  # ─────────────────────────────────────────────
  # 2.6 CloudFront（OAC + Response Headers Policy）
  # ─────────────────────────────────────────────
  GezaCloudFrontOAC:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: geza-oac
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  GezaResponseHeadersPolicy:
    Type: AWS::CloudFront::ResponseHeadersPolicy
    Properties:
      ResponseHeadersPolicyConfig:
        Name: geza-security-headers
        SecurityHeadersConfig:             # SECURITY-04
          ContentSecurityPolicy:
            ContentSecurityPolicy: >
              default-src 'self';
              script-src 'self';
              style-src 'self' 'unsafe-inline';
              img-src 'self' data:;
              connect-src 'self' https://*.execute-api.ap-northeast-1.amazonaws.com
                https://cognito-idp.ap-northeast-1.amazonaws.com
                https://transcribestreaming.ap-northeast-1.amazonaws.com;
              font-src 'self';
              frame-ancestors 'none';
            Override: true
          StrictTransportSecurity:
            AccessControlMaxAgeSec: 63072000  # 2年
            IncludeSubdomains: true
            Override: true
          ContentTypeOptions:
            Override: true
          FrameOptions:
            FrameOption: DENY
            Override: true
          ReferrerPolicy:
            ReferrerPolicy: strict-origin-when-cross-origin
            Override: true
          XSSProtection:
            ModeBlock: true
            Override: true

  GezaDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        DefaultRootObject: index.html
        PriceClass: PriceClass_200  # 日本含む（PriceClass_All より安価）
        Origins:
          - Id: S3Origin
            DomainName: !GetAtt GezaStaticBucket.RegionalDomainName
            OriginAccessControlId: !Ref GezaCloudFrontOAC
            S3OriginConfig: {}
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https   # SECURITY-06
          ResponseHeadersPolicyId: !Ref GezaResponseHeadersPolicy
          CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # CachingOptimized（TTL=1年）
          Compress: true
        CacheBehaviors:
          - PathPattern: "index.html"    # index.html: TTL=0（no-cache）
            TargetOriginId: S3Origin
            ViewerProtocolPolicy: redirect-to-https
            ResponseHeadersPolicyId: !Ref GezaResponseHeadersPolicy
            CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad  # CachingDisabled
          - PathPattern: "*.html"        # 他の HTML ファイルも TTL=0
            TargetOriginId: S3Origin
            ViewerProtocolPolicy: redirect-to-https
            ResponseHeadersPolicyId: !Ref GezaResponseHeadersPolicy
            CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad
        CustomErrorResponses:            # C-1修正: SPAフォールバック（リロード時の403/404をindex.htmlにルーティング）
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html
            ErrorCachingMinTTL: 0       # エラーページをキャッシュしない
          - ErrorCode: 404
            ResponseCode: 200
            ResponsePagePath: /index.html
            ErrorCachingMinTTL: 0
        HttpVersion: http2

  # ─────────────────────────────────────────────
  # 2.7 Cognito（User Pool + Client + Identity Pool）
  # Q11: パスワードB（12文字以上）/ MFA C（必須 TOTP）/ サインアップB（管理者のみ）
  # ─────────────────────────────────────────────
  GezaUserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: geza-user-pool
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: true    # Q11: セルフサービスサインアップ無効
      Policies:
        PasswordPolicy:
          MinimumLength: 12               # Q11: パスワード B（最小12文字）
          RequireUppercase: true
          RequireLowercase: true
          RequireNumbers: true
          RequireSymbols: true
      MfaConfiguration: "ON"             # Q11: MFA C（必須）
      EnabledMfas:
        - SOFTWARE_TOKEN_MFA             # TOTP（Google Authenticator 等）
      Schema:
        - AttributeDataType: String
          Name: email
          Required: true
          Mutable: true
      AutoVerifiedAttributes: [email]
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      UserPoolAddOns:
        AdvancedSecurityMode: OFF         # ハッカソンスコープでは省略（コスト考慮）

  GezaUserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      UserPoolId: !Ref GezaUserPool
      ClientName: geza-web-client
      GenerateSecret: false               # SPA はシークレット不要
      ExplicitAuthFlows:
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
        - ALLOW_USER_PASSWORD_AUTH        # 管理者ツール用（初期パスワード変更）
      AccessTokenValidity: 1
      IdTokenValidity: 1
      RefreshTokenValidity: 30
      TokenValidityUnits:
        AccessToken: hours
        IdToken: hours
        RefreshToken: days
      PreventUserExistenceErrors: ENABLED  # ユーザー列挙攻撃対策（SECURITY-02）

  GezaIdentityPool:
    Type: AWS::Cognito::IdentityPool
    Properties:
      IdentityPoolName: geza-identity-pool
      AllowUnauthenticatedIdentities: false
      CognitoIdentityProviders:
        - ClientId: !Ref GezaUserPoolClient
          ProviderName: !GetAtt GezaUserPool.ProviderName

  GezaIdentityPoolAuthRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: geza-identity-pool-auth-role
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Federated: cognito-identity.amazonaws.com
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals:
                "cognito-identity.amazonaws.com:aud": !Ref GezaIdentityPool
              "ForAnyValue:StringLike":
                "cognito-identity.amazonaws.com:amr": authenticated
      Policies:
        - PolicyName: geza-transcribe-policy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - transcribe:StartStreamTranscriptionWebSocket
                Resource: "*"
              - Effect: Allow
                Action:
                  - polly:SynthesizeSpeech     # フロントエンドから直接呼ばない。念のため
                Resource: "*"

  GezaIdentityPoolRoles:
    Type: AWS::Cognito::IdentityPoolRoleAttachment
    Properties:
      IdentityPoolId: !Ref GezaIdentityPool
      Roles:
        authenticated: !GetAtt GezaIdentityPoolAuthRole.Arn

  # ─────────────────────────────────────────────
  # 2.8 API Gateway HTTP API v2
  # ─────────────────────────────────────────────
  GezaHttpApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: "$default"
      Auth:
        DefaultAuthorizer: CognitoJwtAuthorizer
        Authorizers:
          CognitoJwtAuthorizer:
            IdentitySource: "$request.header.Authorization"
            JwtConfiguration:
              issuer: !Sub "https://cognito-idp.ap-northeast-1.amazonaws.com/${GezaUserPool}"
              audience:
                - !Ref GezaUserPoolClient
      CorsConfiguration:
        AllowHeaders:
          - "Authorization"
          - "Content-Type"
        AllowMethods:
          - "GET"
          - "POST"
          - "OPTIONS"
        AllowOrigins:
          - !Sub "https://${GezaDistribution.DomainName}"
      DefaultRouteSettings:
        ThrottlingBurstLimit: 100
        ThrottlingRateLimit: 20
      AccessLogSettings:
        DestinationArn: !GetAtt GezaApiAccessLogGroup.Arn
        Format: >
          {"requestId":"$context.requestId",
           "ip":"$context.identity.sourceIp",
           "requestTime":"$context.requestTime",
           "httpMethod":"$context.httpMethod",
           "routeKey":"$context.routeKey",
           "status":"$context.status",
           "responseLength":"$context.responseLength",
           "integrationLatency":"$context.integrationLatency",
           "integrationErrorMessage":"$context.integrationErrorMessage"}

  GezaApiAccessLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/apigateway/geza-http-api
      RetentionInDays: 7

  # ─────────────────────────────────────────────
  # 2.9 Lambda 関数（23本）
  # 設定値は Lambda 設定マトリクス（第3章）を参照
  # 代表的な定義パターンを示す。23本全体は deployment-architecture.md のディレクトリ構成を参照
  # ─────────────────────────────────────────────

  # --- fast Lambda 代表例（assess-apology）---
  AssessApologyFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: assess-apology
      Handler: lambda_function.lambda_handler
      CodeUri: backend/functions/assess-apology/
      MemorySize: 256
      Timeout: 10
      Policies:
        - Statement:
            - Effect: Allow
              Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:Query]
              Resource: !GetAtt GezaDataTable.Arn
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource:
                - arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0
            - Effect: Allow
              Action: s3:GetObject
              Resource: !Sub "${GezaPromptsBucket.Arn}/*"
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: POST
            Path: /apology/assess

  # --- premium trigger Lambda 代表例（generate-opponent）---
  GenerateOpponentFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: generate-opponent
      Handler: lambda_function.lambda_handler
      CodeUri: backend/functions/generate-opponent/
      MemorySize: 256      # W-1修正後: trigger のみ（Bedrock呼び出しなし）
      Timeout: 10
      Policies:
        - Statement:
            - Effect: Allow
              Action: [dynamodb:PutItem]
              Resource: !GetAtt GezaDataTable.Arn
            - Effect: Allow
              Action: [sqs:SendMessage]
              Resource: !GetAtt GezaAsyncJobsQueue.Arn
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: POST
            Path: /opponent/generate

  # --- bedrock-dispatcher Lambda（SQSトリガー）---
  BedrockDispatcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: bedrock-dispatcher
      Handler: lambda_function.lambda_handler
      CodeUri: backend/functions/bedrock-dispatcher/
      MemorySize: 1024
      Timeout: 60
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - sqs:ReceiveMessage
                - sqs:DeleteMessage
                - sqs:GetQueueAttributes
              Resource: !GetAtt GezaAsyncJobsQueue.Arn
            - Effect: Allow
              Action: [dynamodb:UpdateItem, dynamodb:PutItem]
              Resource: !GetAtt GezaDataTable.Arn
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource:
                - arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-4-5-v1:0
            - Effect: Allow
              Action: s3:GetObject
              Resource: !Sub "${GezaPromptsBucket.Arn}/*"
      Events:
        SQSTrigger:
          Type: SQS
          Properties:
            Queue: !GetAtt GezaAsyncJobsQueue.Arn
            BatchSize: 1                # 1メッセージずつ処理（60s タイムアウト内に完了させる）
            FunctionResponseTypes:
              - ReportBatchItemFailures  # 個別失敗メッセージのみ DLQ へ

  # --- get-job-status Lambda（新規）---
  GetJobStatusFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: get-job-status
      Handler: lambda_function.lambda_handler
      CodeUri: backend/functions/get-job-status/
      MemorySize: 256
      Timeout: 10
      Policies:
        - Statement:
            - Effect: Allow
              Action: [dynamodb:GetItem]
              Resource: !GetAtt GezaDataTable.Arn
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref GezaHttpApi
            Method: GET
            Path: /jobs/{jobId}

  # ─────────────────────────────────────────────
  # 2.10 CloudWatch Logs Groups（全 Lambda 7日保持）
  # Lambda ごとに /aws/lambda/<function-name> で自動作成されるが
  # 保持期間を明示指定するため全て定義する
  # ─────────────────────────────────────────────
  # 代表例（全23本分を Code Generation ステージで実装）
  AssessApologyLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/lambda/assess-apology
      RetentionInDays: 7

  BedrockDispatcherLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/lambda/bedrock-dispatcher
      RetentionInDays: 7

  GetJobStatusLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/lambda/get-job-status
      RetentionInDays: 7

  # （残り 20本分は同パターンで Code Generation ステージで実装）
```

---

## 3. Lambda 設定マトリクス（23本）

> services.md 定義の Lambda 名を使用。内部プロファイルは logical-components.md の対応表を参照。

### 3.1 fast Lambda（256MB / 10s / Nova Lite）— 7本

| Lambda 名 | エンドポイント | Bedrock モデル | Prompts S3 キー |
|----------|------------|-------------|----------------|
| assess-apology | POST /apology/assess | `amazon.nova-lite-v1:0` | `assess-apology.txt` |
| evaluate-apology | POST /apology/evaluate | `amazon.nova-lite-v1:0` | `evaluate-apology.txt` |
| analyze-karte | GET /karte/analyze | `amazon.nova-lite-v1:0` | `analyze-karte.txt` |
| evaluate-guidance | POST /guidance/evaluate | `amazon.nova-lite-v1:0` | `evaluate-guidance.txt` |
| check-draft | POST /draft/check | `amazon.nova-lite-v1:0` | `check-draft.txt` |
| analyze-anger | POST /during/analyze-anger | `amazon.nova-lite-v1:0` | `analyze-anger.txt` |
| detect-danger-speech | POST /during/detect-danger | `amazon.nova-lite-v1:0` | `detect-danger-speech.txt` |

### 3.2 standard Lambda（512MB / 30s / Claude Haiku 4.5）— 2本

| Lambda 名 | エンドポイント | Bedrock モデル | Prompts S3 キー |
|----------|------------|-------------|----------------|
| probe-incident | POST /incident/probe | `anthropic.claude-haiku-4-5-v1:0` | `probe-incident.txt` |
| generate-plan | POST /plan/generate | `anthropic.claude-haiku-4-5-v1:0` | `generate-plan.txt` |

### 3.3 premium trigger Lambda（256MB / 10s / Bedrock呼び出しなし）— 8本

| Lambda 名 | エンドポイント | SQS functionType |
|----------|------------|----------------|
| generate-opponent | POST /opponent/generate | `generate-opponent` |
| generate-story | POST /story/generate | `generate-story` |
| generate-feedback | POST /feedback/generate | `generate-feedback` |
| generate-prevention | POST /prevention/generate | `generate-prevention` |
| generate-follow-mail | POST /mail/generate | `generate-follow-mail` |
| analyze-reply | POST /reply/analyze | `analyze-reply` |
| diagnose-tendency | GET /karte/diagnose | `diagnose-tendency` |
| generate-guidance-feedback | POST /guidance/feedback | `guidance-feedback` |

> **trigger Lambda の処理**: ①`input_validator.py` でバリデーション ②`uuid.uuid4()` で jobId 生成  
> ③DynamoDB `PutItem`（PK=`USER#<userId>`, SK=`JOB#<jobId>`, status=`PENDING`）  
> ④SQS `SendMessage`（`{"userId": ..., "jobId": ..., "functionType": ..., "payload": {...}}`）  
> ⑤`{"jobId": "<uuid>", "status": "PENDING"}` を即返却

### 3.4 non-bedrock Lambda（256MB / 10s）— 4本

| Lambda 名 | エンドポイント | 主処理 | IAM アクション |
|----------|------------|------|-------------|
| save-session | POST /sessions | DynamoDB PutItem | `dynamodb:PutItem` |
| get-karte | GET /karte, GET /karte/{sessionId} | DynamoDB Query/GetItem | `dynamodb:GetItem`, `dynamodb:Query` |
| text-to-speech | POST /tts/synthesize | Polly SynthesizeSpeech | `polly:SynthesizeSpeech` |
| save-story-log | POST /story/log（将来） | DynamoDB PutItem | `dynamodb:PutItem` |

### 3.5 新規 Lambda（+2本）

| Lambda 名 | エンドポイント | メモリ | タイムアウト | IAM アクション |
|----------|------------|------|-----------|-------------|
| get-job-status | GET /jobs/{jobId} | 256MB | 10s | `dynamodb:GetItem`（ConsistentRead=True）|
| bedrock-dispatcher | —（SQSトリガー） | 1024MB | 60s | SQS receive/delete + `dynamodb:UpdateItem` + `bedrock:InvokeModel` + `s3:GetObject` |

---

## 4. IAM ポリシー定義（グループ別・最小権限）

> **SECURITY-12**: 各 Lambda は必要最小限のアクションのみ付与する。

### 4.1 fast Lambda ポリシー

```yaml
- Effect: Allow
  Action:
    - dynamodb:GetItem
    - dynamodb:PutItem
    - dynamodb:Query
  Resource: !GetAtt GezaDataTable.Arn
- Effect: Allow
  Action: bedrock:InvokeModel
  Resource:
    - arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0
- Effect: Allow
  Action: s3:GetObject
  Resource: !Sub "${GezaPromptsBucket.Arn}/*"
```

### 4.2 standard Lambda ポリシー

```yaml
- Effect: Allow
  Action:
    - dynamodb:GetItem
    - dynamodb:PutItem
    - dynamodb:Query
  Resource: !GetAtt GezaDataTable.Arn
- Effect: Allow
  Action: bedrock:InvokeModel
  Resource:
    - arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-haiku-4-5-v1:0
- Effect: Allow
  Action: s3:GetObject
  Resource: !Sub "${GezaPromptsBucket.Arn}/*"
```

### 4.3 premium trigger Lambda ポリシー

```yaml
- Effect: Allow
  Action:
    - dynamodb:PutItem       # JOB# エントリの初期作成（PENDING）
  Resource: !GetAtt GezaDataTable.Arn
- Effect: Allow
  Action:
    - sqs:SendMessage
  Resource: !GetAtt GezaAsyncJobsQueue.Arn
```

### 4.4 non-bedrock Lambda ポリシー

```yaml
# save-session / save-story-log
- Effect: Allow
  Action: [dynamodb:PutItem]
  Resource: !GetAtt GezaDataTable.Arn

# get-karte
- Effect: Allow
  Action: [dynamodb:GetItem, dynamodb:Query]
  Resource: !GetAtt GezaDataTable.Arn

# text-to-speech
- Effect: Allow
  Action: [polly:SynthesizeSpeech]
  Resource: "*"   # Polly は ARN によるリソース指定不可
```

### 4.5 bedrock-dispatcher Lambda ポリシー

```yaml
- Effect: Allow
  Action:
    - sqs:ReceiveMessage
    - sqs:DeleteMessage
    - sqs:GetQueueAttributes
  Resource: !GetAtt GezaAsyncJobsQueue.Arn
- Effect: Allow
  Action:
    - dynamodb:UpdateItem    # status: PROCESSING → COMPLETED / FAILED
    - dynamodb:PutItem       # 必要に応じてエントリ上書き
  Resource: !GetAtt GezaDataTable.Arn
- Effect: Allow
  Action: bedrock:InvokeModel
  Resource:
    - arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-sonnet-4-5-v1:0
- Effect: Allow
  Action: s3:GetObject
  Resource: !Sub "${GezaPromptsBucket.Arn}/*"
```

### 4.6 get-job-status Lambda ポリシー

```yaml
- Effect: Allow
  Action:
    - dynamodb:GetItem       # ConsistentRead=True でポーリング
  Resource: !GetAtt GezaDataTable.Arn
```

---

## 5. 環境変数一覧（SAM Globals より全 Lambda に注入）

| 変数名 | 値（SAM 参照） | 用途 |
|-------|-------------|-----|
| `DYNAMODB_TABLE_NAME` | `!Ref GezaDataTable` → `geza-data` | DynamoDB テーブル名 |
| `SQS_QUEUE_URL` | `!Ref GezaAsyncJobsQueue` | SQS キュー URL（premium trigger が使用） |
| `PROMPTS_BUCKET_NAME` | `!Sub "geza-prompts-${AWS::AccountId}-${AWS::Region}"` | プロンプト S3 バケット名 |
| `BEDROCK_REGION` | `ap-northeast-1`（固定値） | Bedrock リージョン |
| `ALLOWED_ORIGIN` | `!Sub "https://${GezaDistribution.DomainName}"` | CORS 許可オリジン |
| `COGNITO_USER_POOL_ID` | `!Ref GezaUserPool` | JWT 検証用（Lambda 側で必要な場合） |

> **注意**: シークレット（APIキー等）は存在しない。Bedrock / DynamoDB / SQS / Polly は IAM ロールで認証。

---

## 6. DynamoDB テーブル定義（geza-data）

### 6.1 テーブル設定

| 属性 | 値 |
|-----|---|
| テーブル名 | `geza-data` |
| PK | `PK`（String）|
| SK | `SK`（String）|
| 課金モード | `PAY_PER_REQUEST`（On-Demand）|
| 暗号化 | SSE-DynamoDB（AWSマネージドキー）|
| TTL 属性 | `ttl`（Unix timestamp）|
| GSI | **なし**（Q5=A）|
| PITR | 無効 |

### 6.2 アクセスパターン

| パターン | PK | SK | 操作 | ConsistentRead |
|--------|----|----|-----|----------------|
| セッション保存 | `USER#<userId>` | `SESSION#<createdAt>#<sessionId>` | PutItem | — |
| ターン保存 | `USER#<userId>` | `TURN#<sessionId>#<n>` | PutItem | — |
| カルテ一覧 | `USER#<userId>` | `SESSION#`（prefix） | Query | False |
| カルテ詳細 | `USER#<userId>` | `SESSION#<createdAt>#<sessionId>` | GetItem | False |
| ジョブ作成 | `USER#<userId>` | `JOB#<jobId>` | PutItem | — |
| ジョブ状態更新 | `USER#<userId>` | `JOB#<jobId>` | UpdateItem | — |
| ジョブ状態取得 | `USER#<userId>` | `JOB#<jobId>` | GetItem | **True** |

### 6.3 JOB# エントリスキーマ

```
PK:           USER#<userId>          （Cognito sub）
SK:           JOB#<jobId>            （UUID v4）
status:       PENDING | PROCESSING | COMPLETED | FAILED
functionType: generate-opponent | generate-story | ...
payload:      JSON string（元リクエストの入力）
result:       JSON string（COMPLETED 時のみ）
errorMessage: string（FAILED 時のみ）
ttl:          <unix_timestamp>        （作成時 + 86400秒 = 24時間後）
createdAt:    ISO 8601
updatedAt:    ISO 8601
```

---

## 7. SQS 設定

| 属性 | geza-async-jobs | geza-async-jobs-dlq |
|-----|----------------|---------------------|
| タイプ | Standard Queue | Standard Queue |
| Visibility Timeout | 70s（bedrock-dispatcher 60s + バッファ10s）| デフォルト（30s）|
| メッセージ保持期間 | 4日 | 14日 |
| MaxReceiveCount | — | 3（メインキュー設定） |
| 暗号化 | SQS マネージドキー（SSE-SQS）| 同左 |

### SQS メッセージ形式

```json
{
  "userId": "cognito-sub-uuid",
  "jobId": "uuid-v4",
  "functionType": "generate-opponent",
  "payload": {
    "incident_summary": "...",
    "categories": "...",
    ...
  }
}
```

---

## 8. Cognito 設定（Q11: BCB）

### 8.1 User Pool

| 属性 | 値 | 根拠 |
|-----|---|-----|
| パスワード最小文字数 | 12 | Q11=B |
| 大文字・小文字・数字・記号 | 必須 | Q11=B |
| MFA | 必須（TOTP のみ） | Q11=C |
| セルフサービスサインアップ | 無効 | Q11=B |
| セルフサービスパスワードリセット | 有効（メール） | セキュリティベストプラクティス |
| Advanced Security Mode | 無効 | コスト考慮（ハッカソンスコープ） |

### 8.2 管理者によるユーザー作成手順

```bash
# ユーザー作成（管理者が実行）
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --temporary-password <TempPassword12文字以上!> \
  --profile share

# MFA 設定（ユーザーが初回ログイン時に TOTP アプリで設定）
```

### 8.3 Identity Pool（Transcribe WebSocket 用）

| 属性 | 値 |
|-----|---|
| 未認証アクセス | 無効 |
| 認証済みロール | `geza-identity-pool-auth-role` |
| 許可アクション | `transcribe:StartStreamTranscriptionWebSocket` |

---

## 9. CloudFront + S3 設定サマリー

| 属性 | GezaStaticBucket | GezaPromptsBucket |
|-----|-----------------|-------------------|
| バケット名 | `geza-static-XXXXXXXXXXXX-ap-northeast-1` | `geza-prompts-XXXXXXXXXXXX-ap-northeast-1` |
| パブリックアクセス | 全ブロック | 全ブロック |
| アクセス方法 | CloudFront OAC 経由のみ | Lambda IAM ロール経由のみ |
| 暗号化 | S3 マネージドキー（SSE-S3）| S3 マネージドキー（SSE-S3）|

| CloudFront 属性 | 値 |
|---------------|---|
| Origin Access Control | OAC（OAI は非推奨のため使用しない）|
| HTTPS強制 | `redirect-to-https`（SECURITY-06）|
| index.html キャッシュ | CachingDisabled（TTL=0）|
| *.js/*.css/*.svg キャッシュ | CachingOptimized（TTL=1年）|
| Response Headers | SECURITY-04 準拠（CSP/HSTS/X-Content-Type/X-Frame-Options/Referrer-Policy/XSS-Protection）|
| デプロイ後 Invalidation | `/*` を実行（js/css 更新時）|

---

## 10. CloudWatch Logs 設定

| リソース | ロググループ名 | 保持期間 |
|---------|------------|--------|
| API Gateway アクセスログ | `/aws/apigateway/geza-http-api` | 7日 |
| Lambda × 23本 | `/aws/lambda/<function-name>` | 7日（全Lambda）|

> **構造化ログ形式**: `structured_logger.py`（Lambda Layer）で JSON 形式のログを出力する。

---

## 11. セキュリティ対応マトリクス（SECURITY-01〜14）

| ルール ID | 要件 | 対応箇所 | 状態 |
|---------|-----|---------|-----|
| SECURITY-01 | DynamoDB 保存時暗号化 | `SSEEnabled: true, SSEType: AES256` | ✅ |
| SECURITY-02 | 認証・認可 | Cognito JWT Authorizer（全EP）+ `PreventUserExistenceErrors: ENABLED` | ✅ |
| SECURITY-03 | S3 パブリックアクセスブロック | 全 S3 バケットで `BlockPublicAcls/Policy/IgnorePublicAcls/RestrictPublicBuckets: true` | ✅ |
| SECURITY-04 | HTTP セキュリティヘッダー | CloudFront `GezaResponseHeadersPolicy`（CSP/HSTS/X-Content-Type等）| ✅ |
| SECURITY-05 | 入力バリデーション | `input_validator.py`（Lambda Layer、全 Lambda で適用） | ✅ |
| SECURITY-06 | HTTPS 強制 | CloudFront `ViewerProtocolPolicy: redirect-to-https` | ✅ |
| SECURITY-07 | ログ保護 | CloudWatch Logs デフォルト暗号化（AWSマネージドキー）| ✅ |
| SECURITY-08 | S3 転送暗号化 | SDK デフォルト HTTPS / Bucket Policy で `aws:SecureTransport` 条件追加（Code Gen で実装）| ✅ |
| SECURITY-09 | シークレット管理 | 環境変数にシークレットなし（IAM ロールで認証）| ✅ |
| SECURITY-10 | XSS 対策 | フロントエンド `textContent` 使用（`innerHTML` 禁止）+ CSP ヘッダー | ✅ |
| SECURITY-11 | CORS 適切設定 | API GW CORS `AllowOrigins` を CF ドメインのみに限定 | ✅ |
| SECURITY-12 | 最小権限 IAM | Lambda グループ別ポリシー（セクション 4）| ✅ |
| SECURITY-13 | DynamoDB 通信暗号化 | SDK デフォルト TLS | ✅ |
| SECURITY-14 | JWT トークン有効期限 | AccessToken/IdToken: 1時間 / RefreshToken: 30日 | ✅ |

---

## 12. API Gateway エンドポイント一覧（22 API EP + 1 SQS トリガー = 23 Lambda）

> services.md（21EP）+ GET /jobs/{jobId}（+1）= **22 API エンドポイント**。bedrock-dispatcher は SQS トリガーのため API EP ではない。

| # | メソッド | パス | Lambda | プロファイル |
|---|---------|-----|--------|-----------|
| 1 | POST | /apology/assess | assess-apology | fast |
| 2 | POST | /apology/evaluate | evaluate-apology | fast |
| 3 | POST | /incident/probe | probe-incident | standard |
| 4 | POST | /opponent/generate | generate-opponent | premium trigger |
| 5 | POST | /story/generate | generate-story | premium trigger |
| 6 | POST | /plan/generate | generate-plan | standard |
| 7 | POST | /tts/synthesize | text-to-speech | non-bedrock |
| 8 | POST | /feedback/generate | generate-feedback | premium trigger |
| 9 | POST | /prevention/generate | generate-prevention | premium trigger |
| 10 | POST | /mail/generate | generate-follow-mail | premium trigger |
| 11 | POST | /sessions | save-session | non-bedrock |
| 12 | GET | /karte | get-karte | non-bedrock |
| 13 | GET | /karte/{sessionId} | get-karte | non-bedrock |
| 14 | GET | /karte/analyze | analyze-karte | fast |
| 15 | POST | /guidance/evaluate | evaluate-guidance | fast |
| 16 | POST | /guidance/feedback | generate-guidance-feedback | premium trigger |
| 17 | POST | /draft/check | check-draft | fast |
| 18 | POST | /reply/analyze | analyze-reply | premium trigger |
| 19 | GET | /karte/diagnose | diagnose-tendency | premium trigger |
| 20 | POST | /during/analyze-anger | analyze-anger | fast |
| 21 | POST | /during/detect-danger | detect-danger-speech | fast |
| 22 | GET | /jobs/{jobId} | get-job-status | non-bedrock（新規）|
| 23 | POST | /story/log | save-story-log | non-bedrock（将来実装）|
| — | — | —（SQSトリガー）| bedrock-dispatcher | premium（新規）|
