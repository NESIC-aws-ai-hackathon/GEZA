# U0 非機能要件（NFR Requirements）

> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 1. パフォーマンス要件

### 1.1 Lambda 実行タイムアウト（Q1: C）

Lambda の役割（LLMプロファイル）に応じた個別タイムアウト設定を採用する。

| プロファイル | タイムアウト | 対象 Lambda | 根拠 |
|------------|-----------|------------|------|
| `fast` | **10秒** | evaluate-attitude, quick-check, check-draft, classify-*, check-apology, analyze-anger, detect-danger-speech | Nova Lite は 1-3s が実測値。リトライ込みでも 10s で十分 |
| `standard` | **30秒** | generate-plan, probe-incident | Claude Haiku 4.5 は 5-15s 想定。リトライ込みで 30s |
| `premium` | **29秒**（API GW 上限） | generate-opponent, generate-story, generate-feedback, generate-prevention, generate-follow-mail, analyze-reply, diagnose-tendency, guidance-feedback | Claude Sonnet は 20-30s 想定。**API Gateway HTTP API v2 の 30s ハードリミットに対応し 29s に设定**。非同期パターンを採用（NFR Design で詳細設計） |
| 非 Bedrock | **10秒** | save-session, get-karte, text-to-speech | DynamoDB / Polly は 1-3s |

> **⚠️ C-1 修正—技術的制約**: API Gateway HTTP API v2 の統合タイムアウト上限は **29 秒**（ハードリミット）。premium Lambda（Claude Sonnet）は 20〞30 秒かかる場合があるため、**非同期パターン**を採用する。API GW エンドポイントは即座に jobId を返却，バックグラウンドで Bedrock を呼び出す。クライアントは GET /jobs/{jobId} でポーリング。**NFR Design で具体的な非同期アーキテクチャを設計する**。

### 1.2 Lambda メモリサイズ（Q2: B）

Lambda の役割に応じたメモリ最適化を行う。

| プロファイル | メモリ | 対象 Lambda | 根拠 |
|------------|-------|------------|------|
| `fast` | **256 MB** | Nova Lite使用Lambda（8本）+ 非Bedrock（3本） | 軽量処理。コールドスタート短縮とコストのバランス |
| `standard` | **512 MB** | probe-incident, generate-plan | 中程度の複雑性 |
| `premium` | **1024 MB** | Sonnet使用Lambda（8本） | 複雑なプロンプト処理・大きなレスポンス処理のため |

### 1.3 レスポンスタイム目標（Q4: B）

| シナリオ | 目標 | 備考 |
|---------|------|------|
| fast Lambda E2E（FE→API→Lambda→Bedrock→FE） | **3秒以内** | Nova Lite 1-3s + API/FE オーバーヘッド |
| standard Lambda E2E | **5秒以内** | Claude Haiku 4.5 5-15s の上限 |
| premium Lambda E2E（謝罪評価・台本生成等）— 非同期パターン | **30秒以内（UI待機）/ 29秒（タイムアウト）** | 非同期パターン採用（API GW HTTP API v2 の 30s ハードリミット対応）。UI にプログレス表示 ・ 5秒右忍で中間メッセージを表示。GET /jobs/{jobId} ポーリングで最終結果を受信 |
| text-to-speech（Polly） | **3秒以内** | Polly Neural は 1-2s |
| フロントエンド初期ロード | **5秒以内** | Wi-Fi/LTE 前提（Q7: B） |

### 1.4 コールドスタート（Q3: A）

- コールドスタートレイテンシ（300〜800ms）は許容する
- Provisioned Concurrency / ウォームアップ関数は実装しない（ハッカソンスコープ）
- 必要に応じてデプロイ後に評価し、問題があれば対処する

---

## 2. スケーラビリティ要件

### 2.1 API Gateway スロットリング（Q9: B）

| 設定値 | 値 |
|-------|---|
| デフォルト バースト制限 | **100 req（同時）** |
| デフォルト レート制限 | **20 req/s** |
| 根拠 | ハッカソンデモでの同時アクセスは最大10〜20名程度を想定。コスト保護を優先 |

### 2.2 DynamoDB スケーリング（Q5: A）

| 設定 | 値 |
|-----|---|
| 課金モード | **PAY_PER_REQUEST（On-Demand）** |
| PITR | オフ（コスト考慮） |
| 根拠 | デモ・検証フェーズは予測不可能なトラフィックパターンに対して PAY_PER_REQUEST が最適 |

### 2.3 Lambda 同時実行

| 設定 | 値 |
|-----|---|
| Reserved Concurrency | 未設定（アカウントデフォルト） |
| 最大想定同時実行数 | スロットリング 20req/s × タイムアウト = 最大 20×60 = 1,200（理論値） |
| 実運用想定 | デモ環境: 5〜20並列 |

---

## 3. 可用性要件（Q8: C）

ハッカソンデモスコープのため、特別な可用性要件は設けない。

| コンポーネント | 依存 SLA | 要件 |
|--------------|---------|------|
| API Gateway | AWS 管理（99.95%） | AWS 管理 SLA に依存 |
| Lambda | AWS 管理（99.95%） | AWS 管理 SLA に依存 |
| DynamoDB | AWS 管理（99.999%） | AWS 管理 SLA に依存 |
| S3 + CloudFront | AWS 管理（99.9%+） | AWS 管理 SLA に依存 |
| Bedrock | AWS 管理（99.9%） | Bedrock 障害時は 503 を返却（ビジネスルール RETRY-05） |

---

## 4. セキュリティ要件（SECURITY-01〜14 準拠）

Functional Design の business-rules.md で定義済み。NFR として再確認する。

| セキュリティ要件 | ルールID | 実装状態 |
|----------------|---------|---------|
| DynamoDB 保存時暗号化 | SECURITY-01 | SSE-DynamoDB（AWSマネージドキー） |
| API アクセスログ | SECURITY-02 | API Gateway アクセスログ有効化 |
| 構造化アプリケーションログ | SECURITY-03 | shared/decorators.py の structured logger |
| HTTP セキュリティヘッダー | SECURITY-04 | CloudFront Response Headers Policy |
| 全入力バリデーション | SECURITY-05 | shared/input_validator.py |
| 最小権限 IAM | SECURITY-06 | SAM template.yaml（個別アクション指定） |
| S3 暗号化 | SECURITY-07 | SSE-S3（AWSマネージドキー） |
| 認証（Cognito JWT） | SECURITY-08 | 全エンドポイント Cognito JWT Authorizer |
| エラーメッセージ無害化 | SECURITY-09 | shared/decorators.py |
| IaC（SAM） | SECURITY-10 | template.yaml のみでインフラ管理 |
| レート制限 | SECURITY-11 | API Gateway スロットリング（burst=100 / rate=20） |
| 認証設定 | SECURITY-12 | Cognito パスワードポリシー・MFA OPTIONAL |
| インジェクション対策 | SECURITY-13 | ブロックリスト + HTMLエスケープ |
| 認証ログ | SECURITY-14 | userId を構造化ログに含める |

---

## 5. 運用・監視要件

### 5.1 CloudWatch Logs 設定（Q6: A）

| 設定 | 値 |
|-----|---|
| 保持期間 | **7日間** |
| フォーマット | JSON 構造化ログ（LOG-01） |
| 対象 | 全 21 Lambda + API Gateway アクセスログ |
| 根拠 | コスト最小化。ハッカソン期間内のデバッグに 7日間で十分 |

### 5.2 エラー監視・アラート（Q10: A）

| 設定 | 値 |
|-----|---|
| 監視方式 | CloudWatch Logs 手動確認（アラートなし） |
| CloudWatch Alarm | 設定しない |
| CloudWatch Dashboard | 構築しない |
| 根拠 | ハッカソンデモ期間のみの稼働。常時監視は不要 |

---

## 6. 信頼性要件

### 6.1 エラーハンドリング

| 要件 | 実装 |
|-----|------|
| Bedrock 一時障害 | 指数バックオフリトライ（最大3回）→ 503 返却 |
| Lambda タイムアウト | API Gateway がタイムアウトレスポンスを返す（504） |
| DynamoDB エラー | Lambda デコレーターが 500 を返す |
| 認証エラー | JWT リフレッシュ → 失敗時ログイン画面へリダイレクト |

### 6.2 データ整合性

| 要件 | 実装 |
|-----|------|
| セッションデータ | DynamoDB On-Demand（強整合性読み取りオプション） |
| 会話ターン | 書き込み後即時読み取りが必要なケースでは ConsistentRead=True |
| PITR | オフ（Q7: C相当。コスト考慮） |

---

## 7. メンテナビリティ要件

| 要件 | 方針 |
|-----|------|
| コード共通化 | Lambda Layer（shared/）に共通ロジックを集約 |
| 設定管理 | 環境変数（SAM Parameters）でステージ別設定 |
| インフラ管理 | SAM template.yaml のみ（手動リソース作成禁止） |
| テスト | PBT（fast-check / Hypothesis）+ 単体テスト |

---

## 8. セキュリティ・PBT コンプライアンスサマリー（NFR Requirements ステージ）

### SECURITY-01〜14 コンプライアンス

| ルール | ステータス | 備考 |
|-------|---------|------|
| SECURITY-01 | ✅ 準拠 | §4 DynamoDB SSE-DynamoDB 確認済み |
| SECURITY-02 | ✅ 準拠 | §5.1 API Gateway ログ有効化確認済み |
| SECURITY-03 | ✅ 準拠 | §5.1 構造化ログ確認済み |
| SECURITY-04 | ✅ 準拠 | CloudFront Response Headers Policy（Functional Design済み） |
| SECURITY-05 | ✅ 準拠 | input_validator.py（Functional Design済み） |
| SECURITY-06 | ✅ 準拠 | 最小権限 IAM（Functional Design済み） |
| SECURITY-07 | ✅ 準拠 | S3 SSE-S3（SAM template.yaml で定義予定） |
| SECURITY-08 | ✅ 準拠 | Cognito JWT Authorizer（全エンドポイント） |
| SECURITY-09 | ✅ 準拠 | decorators.py のエラーメッセージ無害化 |
| SECURITY-10 | ✅ 準拠 | SAM IaC のみ |
| SECURITY-11 | ✅ 準拠 | §2.1 burst=100 / rate=20 |
| SECURITY-12 | ✅ 準拠 | Cognito パスワードポリシー・MFA OPTIONAL |
| SECURITY-13 | ✅ 準拠 | インジェクション検知（Functional Design済み） |
| SECURITY-14 | ✅ 準拠 | userId を構造化ログに含める |

### PBT-01 コンプライアンス

| ルール | ステータス | 備考 |
|-------|---------|------|
| PBT-01 | ✅ 準拠 | Functional Design の business-logic-model.md §7 にテスタブルプロパティ一覧記載済み |
