# U0 Infrastructure Design 計画

> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## ステップ一覧

- [x] Step 1: 設計成果物（Functional Design / NFR Design）分析
- [x] Step 2: Infrastructure Design 計画の作成
- [x] Step 3: ユーザー確認事項の生成
- [x] Step 4: 計画ファイルの保存（このファイル）
- [x] Step 5: 回答収集・曖昧性確認
- [x] Step 6: Infrastructure Design 成果物生成
- [x] Step 7: 完了メッセージ提示

---

## 設計コンテキスト（前ステージからの引き継ぎ）

### 確定済み事項（質問不要）

| 項目 | 確定値 |
|-----|-------|
| クラウドプロバイダー | AWS |
| リージョン | ap-northeast-1 |
| デプロイツール | AWS SAM（template.yaml） |
| Lambda 本数 | **23本**（元21本 + bedrock-dispatcher + get-job-status） |
| Lambda ランタイム | Python 3.12 |
| API | API Gateway HTTP API v2（21EP + GET /jobs/{jobId} = **23EP**） |
| DB | DynamoDB geza-data（On-Demand / シングルテーブル） |
| 認証 | Cognito User Pool + Identity Pool |
| フロントエンド配信 | S3 + CloudFront（OAC） |
| 非同期キュー | SQS geza-async-jobs（Standard Queue / VisTimeout=70s） + DLQ |
| セキュリティ | SECURITY-01〜14 全 BLOCKING 適用 |
| Bedrock リージョン | ap-northeast-1（プロトタイプ実証済み） |
| Lambda Layer 名 | `geza-shared`（Python 3.12） |

---

## ユーザー確認事項（Q1〜Q12）

### デプロイ環境

**Q1: SAM 環境分離はどのように行いますか？**

ハッカソンスコープではステージ（dev / prod）の分離方針を決定する必要があります。

| 選択肢 | 説明 |
|-------|-----|
| A | **シングルスタック（本番のみ）** — ステージ切り替えなし。`--stack-name geza-app` 固定 |
| B | **SAM Parameters によるステージ別スタック** — `--parameter-overrides Stage=dev` で `geza-app-dev` / `geza-app-prod` を切り替え |
| C | その他（詳細を記載） |

[Answer]: A

---

**Q2: S3 バケット命名規則を教えてください**

SAM テンプレートで S3 バケットを定義する際の命名が必要です。  
（AWSアカウントIDはプレースホルダー `XXXXXXXXXXXX` を使用）

| 選択肢 | バケット名例 |
|-------|------------|
| A | **自動生成（SAM に任せる）** — `!Sub "geza-static-${AWS::AccountId}-${AWS::Region}"` |
| B | **固定名（手動指定）** — 名前を回答に記載してください |

[Answer]: A

---

### コンピュート（Lambda・Layer）

**Q3: SAM テンプレートの構成方針を教えてください**

23本の Lambda と付随リソースを 1ファイルで管理するか、ネストするかを決定します。

| 選択肢 | 説明 |
|-------|-----|
| A | **シングル template.yaml**（全リソースを 1ファイルで管理、シンプル） |
| B | **ネストされたスタック**（Lambdaグループ別に分割し、親 template.yaml から参照） |

[Answer]: A

---

**Q4: Lambda 共通環境変数（非シークレット）の管理方法は？**

`DYNAMODB_TABLE_NAME` / `SQS_QUEUE_URL` / `ALLOWED_ORIGIN` / `BEDROCK_REGION` などの設定値をどこで管理するか。

| 選択肢 | 説明 |
|-------|-----|
| A | **SAM Globals + Parameters**（template.yaml の `Globals:` セクションで一括設定） |
| B | **SSM Parameter Store**（実行時に取得。セキュアだがコールドスタート遅延あり） |
| C | **A + B 組み合わせ**（非シークレットはA、シークレット値はB） |

[Answer]: A

---

### ストレージ（DynamoDB）

**Q5: DynamoDB GSI（グローバルセカンダリインデックス）は必要ですか？**

現在の設計ではシングルテーブルの PK/SK パターンのみですが、検索パターンによって GSI が必要な場合があります。

**現在のアクセスパターン**:
- `USER#<userId>` + `SESSION#` prefix → カルテ一覧（完全対応）
- `USER#<userId>` + `JOB#<jobId>` → ジョブ状態（完全対応）

| 選択肢 | 説明 |
|-------|-----|
| A | **GSI なし**（現在のアクセスパターンで対応可能） |
| B | **GSI あり**（必要な GSI をご記載ください） |

[Answer]: A

---

**Q6: S3 バケット構成はどうしますか？**

フロントエンド静的ファイルとバックエンドプロンプトファイルを同一バケットに置くか分けるか。

| 選択肢 | 説明 |
|-------|-----|
| A | **バケット 1本**（静的ファイル + プロンプトをプレフィックスで分離: `frontend/` / `prompts/`） |
| B | **バケット 2本**（静的ホスティング用 + プロンプト用を分離） |

[Answer]: B

---

### ネットワーク（CloudFront / API GW）

**Q7: CloudFront にカスタムドメインを設定しますか？**

| 選択肢 | 説明 |
|-------|-----|
| A | **CloudFront デフォルトドメインのみ**（`xxxxx.cloudfront.net`、ACM不要） |
| B | **カスタムドメイン + ACM 証明書**（取得済みドメインを記載してください） |

[Answer]: A

---

**Q8: API Gateway にカスタムドメインを設定しますか？**

| 選択肢 | 説明 |
|-------|-----|
| A | **API GW デフォルトドメインのみ**（`xxxxx.execute-api.ap-northeast-1.amazonaws.com`） |
| B | **カスタムドメイン**（取得済みドメインを記載してください） |

[Answer]: A

---

### モニタリング（CloudWatch）

**Q9: CloudWatch Alarms を設定しますか？**

DLQ にメッセージが溜まった場合や Lambda エラー率が高い場合のアラートです。

| 選択肢 | 説明 |
|-------|-----|
| A | **アラームなし**（ハッカソンスコープで省略） |
| B | **最小限のアラーム**（DLQ メッセージ数 > 0 の SNS アラートのみ） |
| C | **Lambda エラー率 + DLQ アラーム**（両方設定） |

[Answer]: A

---

**Q10: CloudWatch Dashboard を作成しますか？**

| 選択肢 | 説明 |
|-------|-----|
| A | **ダッシュボードなし**（CloudWatch Metrics で個別確認） |
| B | **カスタムダッシュボード作成**（Lambda エラー数・DLQ数・API GW レスポンス時間を一覧表示） |

[Answer]: A

---

### Cognito

**Q11: Cognito User Pool のパスワードポリシーと MFA 設定は？**

| 項目 | 選択肢 | 説明 |
|-----|-------|------|
| パスワードポリシー | A: 最小8文字（デフォルト緩和） / B: 最小12文字・英数字記号必須（推奨セキュリティ） | |
| MFA | A: 無効（ハッカソンUXを優先） / B: オプション（TOTP） / C: 必須 | |
| セルフサービスサインアップ | A: 有効（誰でも登録可） / B: 無効（管理者のみ登録） | |

[Answer]: BCB
管理者が作って渡す方式。作ってもらうのはリスク高い

---

### 共有インフラ

**Q12: SAM デプロイ用 S3 バケット（Artifacts 格納）は既存ですか？**

`sam deploy` は Lambda パッケージを S3 にアップロードします。

| 選択肢 | 説明 |
|-------|-----|
| A | **SAM が自動作成**（`sam deploy --resolve-s3` で管理用バケットを自動作成） |
| B | **既存バケットを指定**（バケット名を記載してください） |

[Answer]: A

---

## 設計スコープ確認

**生成予定の成果物**:

1. `aidlc-docs/construction/U0/infrastructure-design/infrastructure-design.md`
   - SAM template.yaml の全リソース定義（疑似コード形式）
   - Lambda × 23本の設定マトリクス
   - IAM Role / Policy 定義
   - DynamoDB テーブル定義（TTL / GSI）
   - SQS キュー定義
   - Cognito User/Identity Pool 設定
   - CloudWatch Logs 設定（全 Lambda 7日保持）

2. `aidlc-docs/construction/U0/infrastructure-design/deployment-architecture.md`
   - デプロイアーキテクチャ図（ASCII）
   - SAM デプロイコマンド・手順
   - 環境変数一覧
   - デプロイ後の動作確認手順

