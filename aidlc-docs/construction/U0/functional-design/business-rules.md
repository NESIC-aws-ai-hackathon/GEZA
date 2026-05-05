# U0 ビジネスルール定義

> AI-DLC CONSTRUCTION Phase — Functional Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 1. 入力バリデーションルール（SECURITY-05 準拠）

### 1.1 フィールドバリデーションルール一覧

| ルール番号 | 対象 | 条件 | エラーメッセージ |
|-----------|------|------|----------------|
| VAL-01 | 全フィールド | required フィールドが JSON に存在しない | `フィールド '{name}' は必須です` |
| VAL-02 | 全フィールド | 型が期待値と不一致（str/int/list/dict） | `'{name}' の型が不正です` |
| VAL-03 | 文字列フィールド | 2,001 文字以上 | `'{name}' は2000文字以内で入力してください` |
| VAL-04 | 文字列フィールド | プロンプトインジェクションパターン検出 | `不正な入力が含まれています` |
| VAL-05 | 全フィールド | 数値フィールドが負数（prohibited_negative: true） | `'{name}' は0以上の整数を入力してください` |

### 1.2 プロンプトインジェクション検知ルール（Q8: C）

以下の正規表現パターンのいずれかに一致した場合、`ValidationError` を送出する（大文字/小文字無視）。

```
INJECTION_PATTERNS:
  - "ignore\s+(previous|all|above|prior)\s+instructions?"
  - "system\s*:"
  - "<\s*/?system\s*>"
  - "you\s+are\s+now"
  - "forget\s+(everything|all)"
  - "new\s+instructions?\s*:"
  - "act\s+as\s+(if\s+you\s+are|a)"
  - "jailbreak"
  - "DAN\s+mode"
  - "pretend\s+you"
```

### 1.3 HTMLエスケープルール（Q8: C、SECURITY-05）

- 全 `str` フィールドに対して以下の文字を HTML エスケープして返す
- バリデーション通過後の値を使用側（Lambda ハンドラー）に渡す前に適用

| 元文字 | エスケープ後 |
|-------|-----------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#x27;` |

---

## 2. Bedrock 呼び出しルール

### 2.1 リトライルール（Q2: B）

| ルール番号 | 内容 |
|-----------|------|
| RETRY-01 | リトライ対象例外: `ThrottlingException` / `ServiceUnavailableException` のみ |
| RETRY-02 | 最大リトライ回数: 3回（初回 + 2リトライ） |
| RETRY-03 | 待機時間: 指数バックオフ — 1秒、2秒、4秒 |
| RETRY-04 | それ以外の例外（AccessDeniedException 等）はリトライせず即時再送出 |
| RETRY-05 | 3回目失敗後は `BedrockThrottleError` を送出（@handle_errors が 503 に変換） |

### 2.2 LLMプロファイルルール

| プロファイル | モデル | 使用 Lambda |
|------------|-------|------------|
| `fast` | amazon.nova-lite-v1:0 | evaluate-attitude, quick-check, check-draft, classify-incident, check-apology, classify-karte, classify-prevention, classify-follow |
| `standard` | anthropic.claude-haiku-4-5-v1:0 | generate-plan, probe-incident |
| `premium` | anthropic.claude-sonnet-4-5-v1:0 | generate-opponent, generate-story, generate-feedback, generate-prevention, generate-follow-mail, analyze-reply, diagnose-tendency, guidance-feedback |

> **注記（Bedrock 非使用 Lambda）**: 残り3本は Bedrock を呼び出さないため上記プロファイル表に含まれない。
> | Lambda | 理由 |
> |-------|------|
> | `save-session` | DynamoDB への書き込みのみ（LLM不使用） |
> | `get-karte` | DynamoDB からの読み取りのみ（LLM不使用） |
> | `text-to-speech` | AWS Polly 呼び出しのみ（LLM不使用） |

---

## 3. 認証・セッションルール

### 3.1 JWT 自動リフレッシュルール（Q5: A）

| ルール番号 | 内容 |
|-----------|------|
| AUTH-01 | API 呼び出しで 401 が返却された場合、Cognito `refreshToken` でサイレントリフレッシュを試みる |
| AUTH-02 | リフレッシュ成功時は元のリクエストを1回リトライする |
| AUTH-03 | リフレッシュ失敗時（refresh token 期限切れ等）はログイン画面へリダイレクト |
| AUTH-04 | リフレッシュ中に同じ API コールが複数発生した場合は、1回のリフレッシュ完了後にまとめてリトライする（リフレッシュキューイング） |
| AUTH-05 | IdToken / AccessToken は sessionStorage に保管する（localStorage への保存禁止） |

### 3.2 Cognito 設定ルール（SECURITY-08 準拠）

| ルール番号 | 内容 |
|-----------|------|
| COGNITO-01 | パスワードポリシー: 最小8文字・大小英字+数字+記号を必須 |
| COGNITO-02 | メール確認（verify=REQUIRED）を有効化 |
| COGNITO-03 | MFA: オプション（OPTIONAL）— MVP では必須にしない |
| COGNITO-04 | トークン有効期限: IdToken/AccessToken = 1時間、RefreshToken = 30日 |
| COGNITO-05 | ユーザープール外部からの直接書き込み禁止（Admin API 使用時のみ許可） |

---

## 4. セキュリティヘッダールール（SECURITY-04 / Q6: A）

CloudFront Response Headers Policy で以下のヘッダーを付与する。

| ヘッダー | 値 | 目的 |
|---------|---|------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPS 強制（HSTS） |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.amazonaws.com; media-src 'self' blob:; frame-ancestors 'none'` | XSS・Clickjacking 防止 |
| `X-Content-Type-Options` | `nosniff` | MIME スニッフィング防止 |
| `X-Frame-Options` | `DENY` | Clickjacking 防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラー漏洩防止 |
| `Permissions-Policy` | `microphone=(self), camera=()` | 不要 API 無効化 |

---

## 5. DynamoDB データ保護ルール（Q7: C）

| ルール番号 | 内容 |
|-----------|------|
| DB-01 | AWSマネージドキー（SSE-DynamoDB）による保存時暗号化を有効化 |
| DB-02 | Point-in-Time Recovery（PITR）はオフ（コスト考慮、ハッカソンスコープ） |
| DB-03 | DynamoDB への直接アクセスは Lambda IAM ロールのみ許可（SECURITY-01） |
| DB-04 | 個人情報（メールアドレス）は Cognito 管理に委任し、DynamoDB には userId（sub）のみ保管 |

---

## 6. API レート制限ルール（SECURITY-11）

| ルール番号 | 内容 |
|-----------|------|
| RATE-01 | API Gateway HTTP API にデフォルトスロットリングを設定: バースト=500、レート=100 req/s |
| RATE-02 | ユーザーごとのスロットリングは Cognito ユーザープールの UsagePlan と連携（MVP はデフォルトのみ） |
| RATE-03 | Lambda 同時実行数上限: 21 Lambda × 10 = 210（reserved concurrency 未設定、アカウントデフォルト） |

---

## 7. エラーハンドリングルール（SECURITY-09）

| ルール番号 | 内容 |
|-----------|------|
| ERR-01 | 本番レスポンスにスタックトレース・内部パス・フレームワーク情報を含めない |
| ERR-02 | エラーメッセージはユーザー向け日本語テキストのみ |
| ERR-03 | 詳細エラーは CloudWatch Logs に `request_id` と共に記録 |
| ERR-04 | `request_id` はエラーレスポンスに含める（ユーザーがサポートに報告できるよう） |
| ERR-05 | HTTP ステータスコード: 400=バリデーションエラー / 401=認証失敗 / 403=認可失敗 / 422=入力意味エラー / 429=レート超過 / 500=サーバーエラー / 503=Bedrock 一時障害 |

---

## 8. CORS ルール（SECURITY-08）

| ルール番号 | 内容 |
|-----------|------|
| CORS-01 | `Access-Control-Allow-Origin` にワイルドカード `*` を使用しない |
| CORS-02 | 許可オリジンは CloudFront ドメイン（SSM Parameter Store / 環境変数 `ALLOWED_ORIGIN`）のみ |
| CORS-03 | プリフライトリクエスト（OPTIONS）は API Gateway の CORS 設定で処理する |

---

## 9. ログ・監査ルール（SECURITY-03）

| ルール番号 | 内容 |
|-----------|------|
| LOG-01 | 構造化ログ（JSON形式）で CloudWatch Logs に出力 |
| LOG-02 | ログに `request_id`, `userId`(cognito sub), `function_name` を含める |
| LOG-03 | パスワード・トークン・個人情報フルテキストをログに含めない |
| LOG-04 | API Gateway アクセスログを有効化（request_id, status, ip は含める） |
| LOG-05 | CloudTrail による API 呼び出し記録（アカウントレベル、デフォルト有効） |

---

## 10. フロントエンド XSS 防止ルール（SECURITY-05）

| ルール番号 | 内容 |
|-----------|------|
| XSS-01 | ユーザー入力・API レスポンスを DOM に挿入する際は `textContent` のみ使用（`innerHTML` 禁止） |
| XSS-02 | `innerHTML` / `outerHTML` / `document.write()` は使用禁止 |
| XSS-03 | テンプレートリテラルで HTML 文字列を生成する際は必ず `escapeHtml()` を適用 |
| XSS-04 | アバター SVG は facesjs が生成した信頼済み SVG のみ使用（外部 SVG ロード禁止） |

---

## 11. セキュリティコンプライアンス マトリクス

| セキュリティ要件ID | 対応ルール | 実装箇所 |
|-----------------|---------|---------|
| SECURITY-01 | DB-01, DB-03 | SAM template.yaml（DynamoDB SSE設定、Lambda IAM） |
| SECURITY-02 | 該当なし（パッチ管理はAWSマネージド） | Lambda Runtime |
| SECURITY-03 | LOG-01〜05 | shared/decorators.py |
| SECURITY-04 | CloudFront Response Headers Policy | SAM template.yaml |
| SECURITY-05 | VAL-01〜05, XSS-01〜04 | shared/input_validator.py, frontend JS |
| SECURITY-06 | SAM IAM定義（最小権限） | SAM template.yaml |
| SECURITY-07 | AWS KMS（S3）, SSE-DynamoDB | SAM template.yaml |
| SECURITY-08 | COGNITO-01〜05, CORS-01〜03, AUTH-01〜05 | SAM template.yaml, api.js |
| SECURITY-09 | ERR-01〜05 | shared/decorators.py |
| SECURITY-10 | SAM テンプレートのみ（IaC） | SAM template.yaml |
| SECURITY-11 | RATE-01〜03 | API Gateway 設定 |
| SECURITY-12 | COGNITO-01〜05 | SAM template.yaml |
| SECURITY-13 | ブロックリスト検知（VAL-04） | shared/input_validator.py |
| SECURITY-14 | LOG-02（userId をログに記録） | shared/decorators.py |
