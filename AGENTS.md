## 開発フロー

1. コード修正前に `docs/` 配下の該当仕様書を確認
2. 仕様変更 → 仕様書更新 → コード修正（順序厳守）
3. 仕様追加 → 仕様書に項目追加 → コード修正
4. `aidlc-state.md` に変更を記録
5. AI-DLC ルールを遵守
6. AI-DLC成果物とは別にdocs配下に統合した読みやすい成果物を作成し、更新を行うこと。
7. inceptionフェーズ内で実現性の調査と調査結果を記載する資料を作成する。
　 事前調査が必要な項目と方法を洗い出して、人間が実際に調査し、結果を記載する。
8. AI-DLCのワークフローはすべてスキップしないで厳密に行うこと。
9. **各ユニットの Code Generation 完了後に必ずデプロイ＆スモークテストを実施すること（後述「デプロイ手順」参照）。**

## デプロイ手順（各ユニット完了後に必ず実施）

### 前提
- AWS SSO ログイン済みであること: `aws sso login --profile share`
- `python3.13.exe` が PATH に存在すること（初回のみ）:
  ```powershell
  Copy-Item "C:\Users\oono.toshiki\AppData\Local\Programs\Python\Python313\python.exe" `
            "C:\Users\oono.toshiki\AppData\Local\Programs\Python\Python313\python3.13.exe"
  $env:PATH = "C:\Users\oono.toshiki\AppData\Local\Programs\Python\Python313;$env:PATH"
  ```

### ビルド＆デプロイ
```powershell
# 1. バリデーション（"is a valid SAM Template" が表示されればOK）
sam validate

# 2. ビルド
sam build --parallel

# 3. デプロイ（初回・変更時）
sam deploy --profile share --no-confirm-changeset --resolve-s3 `
  --stack-name geza-app `
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM `
  --region ap-northeast-1
```

### スモークテスト（デプロイ後）
```powershell
# Outputs から URL を取得
$outputs = aws cloudformation describe-stacks --stack-name geza-app `
  --profile share --region ap-northeast-1 `
  --query "Stacks[0].Outputs" --output json | ConvertFrom-Json

# 1. APIエンドポイント疎通確認（401 が返れば Lambda + API GW が正常）
$api = ($outputs | Where-Object OutputKey -eq "ApiEndpoint").OutputValue
Invoke-WebRequest -Uri "$api/apology/assess" -Method POST -UseBasicParsing | Select-Object StatusCode

# 2. CloudFront 疎通確認（200 が返れば CloudFront + S3 が正常）
$cf = ($outputs | Where-Object OutputKey -eq "CloudFrontDomain").OutputValue
Invoke-WebRequest -Uri $cf -UseBasicParsing | Select-Object StatusCode

# 3. DynamoDB テーブル確認
aws dynamodb describe-table --table-name geza-data `
  --profile share --region ap-northeast-1 `
  --query "Table.TableStatus" --output text
```

### 既知の環境制約
- SAM CLI は Python 3.14 で動作するが pydantic 警告あり（無害）
- `sam validate` の exit code 1 は pydantic 警告のみ（テンプレート自体は正常）
- `aws_lambda_builders` の packager.py を `errors='replace'` パッチ済み（日本語パス対策）
- `samconfig.toml` のコメントは ASCII のみ（CP932 エンコーディング問題回避）
- CloudFront Invalidation: Outputs に `CloudFrontDistributionId` なし → `aws cloudfront list-distributions --no-verify-ssl` で Distribution ID を取得。`--no-verify-ssl` が必要（ローカルSSL問題）
  ```powershell
  # Distribution ID 取得（dhamuhqye8mp6 → E1AZPLEM19ABKQ）
  aws cloudfront list-distributions --profile share --no-verify-ssl `
    --query "DistributionList.Items[].{Id:Id,Domain:DomainName}" --output table
  # Invalidation 実行
  aws cloudfront create-invalidation --distribution-id E1AZPLEM19ABKQ `
    --paths "/*" --profile share --no-verify-ssl
  ```

## MVPスコープはAI-DLC実行中に随時検討する

**スコープ外は実装しないこと。**

## コードスタイル

```python
# Lambda ハンドラーの例
def lambda_handler(event, context):
    try:
        body = json.loads(event["body"])
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps(result, ensure_ascii=False)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
```

```javascript
// DOM挿入は必ず textContent（XSS対策）
element.textContent = userInput;  // ✅
element.innerHTML = userInput;    // ❌
```

## LLMプロンプトルール

*   テンプレートは `backend/prompts/` に配置、変数は `{{variable_name}}`
*   プロンプト変更時は `docs/prompt-spec.md` を先に更新
*   1ターン = 1 API呼び出しで以下のJSONを返却させる:


## やらないこと

*   `.env` をgitにコミットしない
*   フロントエンドから直接LLM APIを呼ばない
*   実在の人物名・企業名を謝罪ボスとして生成しない
*   法的助言・医療助言を生成しない
*   MVPスコープ外の機能を実装しない
*   **AWSアカウントID・アクセスキー・シークレットキーをコードやドキュメントに記載しない**
    *   アカウントIDはプレースホルダー `XXXXXXXXXXXX` で代替する（12桁）
    *   誤って記載した場合は `git-filter-repo --replace-text` で履歴ごと削除する

## コミットメッセージ

    <type>(<scope>): <subject>

    type: feat | fix | docs | style | refactor | test | chore

## 参照ドキュメント

| ドキュメント | パス | 備考 |
| --------- | ---- | ---- |
| ユーザーストーリー（**正式版**） | `aidlc-docs/inception/user-stories/stories.md` | INVEST済41ストーリー/271SP |
| ユーザーストーリー（草稿） | `docs/draft-user-stories.md` | 初期検討用・参考のみ |
| AI-DLC状態 | `aidlc-state.md` | フェーズ進捗・ユニット定義 |
| 画像アセット定義 | `icons/README.md` | アイコン一覧 |