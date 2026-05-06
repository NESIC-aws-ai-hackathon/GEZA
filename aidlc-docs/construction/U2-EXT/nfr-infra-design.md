# U2-EXT NFR Requirements & Design
> AI-DLC CONSTRUCTION Phase  
> ユニット: U2-EXT 継続的相談機能  
> 生成日: 2026-05-06

---

## NFR Requirements

| ID | 区分 | 要件 |
|----|------|------|
| NFR-EXT-01 | パフォーマンス | 同期API応答 ≤ 15秒（Haiku 4.5使用） |
| NFR-EXT-02 | セキュリティ | JWT認証必須（API GW Cognito Authorizer） |
| NFR-EXT-03 | セキュリティ | Injection検出（shared.input_validator.validate） |
| NFR-EXT-04 | セキュリティ | XSS対策（フロント: textContentのみ） |
| NFR-EXT-05 | 可用性 | エラー時は再送信可（UI上で明示） |
| NFR-EXT-06 | 上限管理 | 会話履歴最大10ターン（超過時は入力無効化） |
| NFR-EXT-07 | コスト | Haiku 4.5使用（standard profile）でコスト最小化 |

---

## NFR Design

### セキュリティ設計

- `validate()` で user_message / incident_summary のインジェクション検出
- conversation_history は list型チェック（最大10要素）
- ALLOWED_ORIGIN によるCORSヘッダー付与

### エラーハンドリング

- `@handle_errors` デコレータで500応答を統一
- タイムアウト30sでLambdaが終了する前にBedrock呼び出し完了を保証

---

## Infrastructure Design

### SAMリソース追加

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
    Events:
      Api:
        Type: HttpApi
        Properties:
          ApiId: !Ref GezaHttpApi
          Method: POST
          Path: /plan/consult
```

### CloudWatch Logs

```yaml
ConsultPlanLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: /aws/lambda/consult-plan
    RetentionInDays: 7
```

### プロンプトファイル

- `backend/prompts/consult_plan.txt`（S3アップロード不要・Lambda内でfile読み込み）
- Layerの `shared/prompt_loader.py` で読み込み

---
