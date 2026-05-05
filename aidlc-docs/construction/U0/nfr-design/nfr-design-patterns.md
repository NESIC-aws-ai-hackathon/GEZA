# U0 NFR 設計パターン

> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 1. 非同期処理パターン（Q1: A — SQS → Lambda）

### 適用対象
premium Lambda（Claude Sonnet 使用）8本: generate-opponent / generate-story / generate-feedback / generate-prevention / generate-follow-mail / analyze-reply / diagnose-tendency / guidance-feedback

### パターン構造

```
Client
  |
  | POST /opponent/generate  {...}
  |
API Gateway HTTP API v2 (29s タイムアウト)
  |
  | Cognito JWT 認証
  |
trigger Lambda (既存 8本を trigger として流用)
  | ・入力バリデーション (input_validator.py)
  | ・jobId = UUID v4 生成
  | ・DynamoDB: JOB#<jobId> を PENDING で書き込み
  | ・SQS: メッセージ送信（function_type + validated_payload）
  |
  |-----> 即座に返却（< 1s）
  |  { "jobId": "<uuid>", "status": "PENDING" }
  |
Client
  |
  | ループ（指数バックオフポーリング）
  | GET /jobs/<jobId>    ← 1s, 2s, 4s, 8s, 16s ... 最大30s待機
  |
get-job-status Lambda (NEW: +1本)
  | ・DynamoDB: JOB#<jobId> を取得
  | ・PENDING/PROCESSING → { status, elapsed_ms }
  | ・COMPLETED          → { status, result }
  | ・FAILED             → { status, error_message }
  |
[バックグラウンド]

geza-async-jobs SQS キュー (NEW: +1リソース)
  |
  | メッセージ受信（Visibility Timeout: 70s）
  |
bedrock-dispatcher Lambda (NEW: +1本 / SQS トリガー)
  | ・function_type に基づいて Bedrock プロンプト・モデル決定
  | ・DynamoDB: status を PROCESSING に更新
  | ・Bedrock Converse API 呼び出し（premium: Claude Sonnet, 60s タイムアウト）
  | ・成功 → DynamoDB: status を COMPLETED + result 書き込み
  | ・失敗 → DynamoDB: status を FAILED + error_message 書き込み
  |
  SQS メッセージ削除（正常完了時）
  SQS メッセージ可視 → Dead-Letter Queue 転送（3回失敗時）
```

### Lambda 本数への影響

| 変更前 | 変更後 | 差分 |
|-------|-------|------|
| 21本（services.md） | 23本 | +2本（bedrock-dispatcher / get-job-status） |

> **注**: premium 8本は trigger として残す（エンドポイントの変更なし）。  
> Infrastructure Design ステージで services.md の更新（+2エンドポイント）を行う。

### SQS メッセージ形式

```json
{
  "jobId": "<uuid>",
  "userId": "<cognito-sub>",
  "functionType": "generate-opponent",
  "payload": {
    "incident_summary": "...",
    "categories": "..."
  },
  "enqueuedAt": "2026-05-05T12:00:00+09:00"
}
```

### Dead-Letter Queue 設定

| 設定 | 値 | 根拠 |
|-----|---|------|
| Max Receive Count | 3 | 指数バックオフリトライ 3回と同数 |
| DLQ 保持期間 | 14日 | デバッグに十分 |
| DLQ アラート | なし（Q10: A = CloudWatch Logs のみ） |

---

## 2. 指数バックオフポーリングパターン（Q2: B）

### フロントエンド実装仕様

```javascript
// PollingClient（frontend/shared/api.js に追加）
async function pollJob(jobId, options = {}) {
  const { maxWaitMs = 60000, baseIntervalMs = 1000, maxIntervalMs = 5000 } = options;

  let intervalMs = baseIntervalMs;  // 1秒から開始
  let elapsedMs = 0;

  while (elapsedMs < maxWaitMs) {
    await sleep(intervalMs);
    elapsedMs += intervalMs;

    const result = await apiClient.get(`/jobs/${jobId}`);

    if (result.status === 'COMPLETED') return result;
    if (result.status === 'FAILED') throw new ApiError(500, result.error_message, jobId);

    // 指数バックオフ: 1s → 2s → 4s → 5s → 5s（上限）
    intervalMs = Math.min(intervalMs * 2, maxIntervalMs);
  }

  throw new ApiError(408, 'タイムアウト：処理に時間がかかっています。後ほど再試行してください。', jobId);
}
```

### タイムライン例（Sonnet 25秒応答の場合）

```
T=0s   : POST /opponent/generate → jobId 即時返却
T=1s   : GET /jobs/<id> → PENDING        (1s間隔)
T=3s   : GET /jobs/<id> → PROCESSING    (2s間隔)
T=7s   : GET /jobs/<id> → PROCESSING    (4s間隔)
T=12s  : GET /jobs/<id> → PROCESSING    (5s上限)
T=17s  : GET /jobs/<id> → PROCESSING    (5s)
T=22s  : GET /jobs/<id> → PROCESSING    (5s)
T=25s  : (Bedrock が応答 → DynamoDB に COMPLETED 書き込み)
T=27s  : GET /jobs/<id> → COMPLETED → 結果表示  (最大遅延2秒)
```

---

## 3. DynamoDB ジョブ状態パターン（Q3: A）

### geza-data テーブル ジョブエントリ定義

```
PK: USER#<userId>
SK: JOB#<jobId>

属性:
  status:        PENDING | PROCESSING | COMPLETED | FAILED
  functionType:  generate-opponent | generate-story | ...
  result:        JSON string（COMPLETED 時）
  errorMessage:  string（FAILED 時）
  ttl:           Unix timestamp（24時間後。TTL で自動削除）
  createdAt:     ISO 8601
  updatedAt:     ISO 8601
```

> **TTL 設定**: ジョブエントリは 24時間後に自動削除（DynamoDB TTL 機能を使用）。  
> これにより古いジョブが蓄積せず、ストレージコストを抑制する。

---

## 4. Bedrock リトライパターン（サーキットブレーカーなし: Q4: A）

### 適用パターン（RETRY-01〜05 のみ）

```
bedrock_client.call()
  |
  ├─ 試行1 → ThrottlingException / ServiceUnavailable
  |   └─ wait 1s
  ├─ 試行2 → 失敗
  |   └─ wait 2s
  ├─ 試行3 → 失敗
  |   └─ BedrockThrottleError 送出
  |       └─ processor Lambda: DynamoDB を FAILED 更新
  |
  └─ その他例外（AccessDeniedException 等）→ 即時 FAILED 更新

(サーキットブレーカー: 実装しない - ハッカソンスコープ)
```

---

## 5. CloudFront キャッシュパターン（Q5: D）

### キャッシュ設定

| アセット | Cache-Control | TTL | デプロイ戦略 |
|---------|-------------|-----|-----------|
| `index.html` | `no-cache, no-store` | **0秒** | 常に最新。アセット参照 URL にバージョンクエリ付与 |
| `*.js`, `*.css` | `public, max-age=31536000, immutable` | **1年** | ファイル内容が変わる場合はクエリパラメータでバスト（`app.js?v=<SHA>`） |
| `*.svg`（facesjs） | `public, max-age=31536000, immutable` | **1年** | 同上 |
| API レスポンス | なし（CloudFront キャッシュ対象外） | — | API Gateway のキャッシュは使用しない |

### デプロイ時のキャッシュ無効化

```powershell
# SAM デプロイ後に実行（deploy.ps1 に組み込む）
aws cloudfront create-invalidation `
  --distribution-id $DISTRIBUTION_ID `
  --paths "/index.html" "/*/index.html"
```

---

## 6. DynamoDB 整合性パターン（Q7: C）

### ConsistentRead 適用ルール

| 操作 | ConsistentRead | 適用ケース |
|-----|--------------|---------|
| ジョブ状態取得（GET /jobs/{jobId}）| **True** | bedrock-dispatcher が書いた直後にクライアントがポーリングするため |
| カルテ一覧取得（GET /karte）| False | 結果整合で十分 |
| 会話ターン取得（セッション内） | **True** | save-session の直後に get-karte が呼ばれるケースあり |
| セッション履歴（過去分） | False | 即時性不要 |

---

## 7. フロントエンドエラー回復パターン（Q8: C）

### エラー + 手動リトライボタン実装仕様

```javascript
// ErrorHandler（frontend/shared/error-handler.js）
function showErrorWithRetry(error, retryCallback) {
  const container = document.getElementById('error-container');

  // XSS対策: textContent使用（innerHTML禁止）
  const message = document.createElement('p');
  message.className = 'error-message';
  message.textContent = error.message;   // ← textContent（XSS-01）

  const retryButton = document.createElement('button');
  retryButton.className = 'btn-retry';
  retryButton.textContent = '再試行';    // ← textContent（XSS-01）
  retryButton.addEventListener('click', () => {
    clearError();
    retryCallback();
  });

  container.appendChild(message);
  container.appendChild(retryButton);
}
```

### エラー種別と表示メッセージ

| HTTP ステータス | 表示メッセージ | リトライ可否 |
|--------------|------------|-----------|
| 400 | 「入力内容を確認してください」 | ❌（ユーザー修正が必要） |
| 401 | 「セッションが切れました。再ログインしてください」 | ❌（ログインへ） |
| 408 | 「処理に時間がかかっています。後ほど再試行してください」 | ✅ |
| 429 | 「現在混雑しています。しばらく待ってから再試行してください」 | ✅ |
| 500 | 「サーバーエラーが発生しました（リクエストID: {requestId}）」 | ✅ |
| 503 | 「AIサービスに一時的な問題が発生しています」 | ✅ |

---

## 8. Lambda Layer 更新パターン（Q6: A）

### SAM による自動更新フロー

```yaml
# template.yaml
Resources:
  SharedLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: geza-shared
      ContentUri: backend/shared/
      CompatibleRuntimes: [python3.12]
      RetentionPolicy: Delete     # 古いバージョンは自動削除

  AssessApologyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Layers:
        - !Ref SharedLayer    # SAM デプロイ時に最新バージョンへ自動更新
```

> `sam deploy` 実行時に SharedLayer の新バージョンが作成され、  
> 全 Lambda が `!Ref SharedLayer` で新バージョンを自動参照する。手動更新は不要。

---

## 9. セキュリティ・PBT コンプライアンスサマリー（NFR Design ステージ）

### SECURITY-01〜14 コンプライアンス

| ルール | ステータス | NFR Design での対応 |
|-------|---------|------------------|
| SECURITY-01 | ✅ 準拠 | DynamoDB SSE（NFR Requirements 確認済み） |
| SECURITY-02 | ✅ 準拠 | API GW アクセスログ有効（NFR Requirements 確認済み） |
| SECURITY-03 | ✅ 準拠 | 構造化ログ（Functional Design 確認済み） |
| SECURITY-04 | ✅ 準拠 | CF Response Headers（Functional Design 確認済み） |
| SECURITY-05 | ✅ 準拠 | input_validator.py（trigger Lambda でも適用） |
| SECURITY-06 | ✅ 準拠 | 最小権限 IAM（bedrock-dispatcher に SQS + DynamoDB + Bedrock 権限） |
| SECURITY-07 | ✅ 準拠 | S3 SSE-S3 |
| SECURITY-08 | ✅ 準拠 | get-job-status Lambda も Cognito JWT Authorizer を適用 |
| SECURITY-09 | ✅ 準拠 | decorators.py（全 Lambda 適用） |
| SECURITY-10 | ✅ 準拠 | SAM IaC |
| SECURITY-11 | ✅ 準拠 | API GW スロットリング burst=100 / rate=20 |
| SECURITY-12 | ✅ 準拠 | Cognito 設定（NFR Requirements 確認済み） |
| SECURITY-13 | ✅ 準拠 | インジェクション検知（trigger Lambda で適用） |
| SECURITY-14 | ✅ 準拠 | userId ログ（全 Lambda） |

### PBT-01 コンプライアンス

| ルール | ステータス | NFR Design での対応 |
|-------|---------|------------------|
| PBT-01 | ✅ 準拠 | Functional Design でプロパティ識別済み。NFR Design では新規追加なし（非同期パターンに Round-trip プロパティなし）|
