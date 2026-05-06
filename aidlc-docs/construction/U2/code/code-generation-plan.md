# U2 Code Generation Plan
> AI-DLC CONSTRUCTION Phase — Code Generation Plan
> 対象ユニット: U2（コンシェルジュコア）
> 生成日: 2026-05-06

---

## 実装対象ファイル（13 ファイル）

| # | ファイル | 操作 | ステップ |
|---|--------|:---:|:------:|
| 1 | `template.yaml` | 変更 | Step 1 |
| 2 | `backend/functions/bedrock-dispatcher/lambda_function.py` | バグ修正 | Step 2 |
| 3 | `backend/prompts/assess_apology.txt` | 更新 | Step 3 |
| 4 | `backend/prompts/probe_incident.txt` | 更新 | Step 3 |
| 5 | `backend/prompts/generate_opponent.txt` | 更新 | Step 3 |
| 6 | `backend/prompts/generate_plan.txt` | 更新 | Step 3 |
| 7 | `backend/functions/assess-apology/lambda_function.py` | 実装 | Step 4 |
| 8 | `backend/functions/probe-incident/lambda_function.py` | 実装 | Step 4 |
| 9 | `backend/functions/generate-opponent/lambda_function.py` | 実装 | Step 4 |
| 10 | `backend/functions/generate-plan/lambda_function.py` | 実装 | Step 4 |
| 11 | `backend/functions/save-session/lambda_function.py` | 実装 | Step 4 |
| 12 | `frontend/pages/inception.html` | 新規 | Step 5 |
| 13 | `frontend/pages/inception.js` | 新規 | Step 5 |
| 14 | `frontend/shared/apology-meter.js` | 新規 | Step 5 |

---

## Step 1: template.yaml 変更

### GenerateOpponentFunction（256MB/10s/SQS → 512MB/30s/Haiku 4.5）
- MemorySize: 256 → 512
- Timeout: 10 → 30
- Policies: DynamoDB(GetItem/PutItem/Query) + Bedrock(Haiku 4.5) / SQS 削除

### GeneratePlanFunction（512MB/30s/Bedrock → 256MB/10s/SQS trigger）
- MemorySize: 512 → 256
- Timeout: 30 → 10
- Policies: DynamoDB(PutItem) + SQS(SendMessage) / Bedrock 削除

---

## Step 2: bedrock-dispatcher バグ修正

`messages` の `content` フィールドが文字列になっている。Bedrock Converse API は
`ContentBlock[]` 形式（`[{"text": "..."}]`）を要求するため修正が必要。

```python
# Before (bug)
messages = [{"role": "user", "content": variables.get("user_message", "")}]

# After (fix)
messages = [{"role": "user", "content": [{"text": variables.get("user_message", "アクションを実行してください。")}]}]
```

---

## Step 3: プロンプト更新

全 4 ファイルをプレースホルダーから本番版へ更新。
変数名は `{{変数名}}` 形式。

| プロンプト | モデル | 主要変数 | 返却 JSON |
|---------|-------|---------|---------|
| assess_apology | Nova Lite (fast) | incident_summary, relationship, categories | ai_degree, stage_name, reasons |
| probe_incident | Haiku 4.5 (standard) | incident_summary, conversation_history, round | status, question/enriched_summary |
| generate_opponent | Haiku 4.5 (standard) | incident_summary, ai_degree, relationship | type, anger_level, avatar_seed, etc. |
| generate_plan | Sonnet (premium) | incident_summary, opponent_type, ai_degree | first_words, full_script, timing, gift, todo_list |

---

## Step 4: Lambda 実装

### 共通パターン
- `@handle_errors` デコレーター使用
- `input_validator.validate()` でバリデーション
- JWT sub を requestContext から取得
- Bedrock 呼び出しは `bedrock_client.call(profile, messages, system_prompt)`

### save-session
- body に session_id あり → UpdateItem（apology_date 追加）
- body に session_id なし → PutItem（新規 UUID 発行）
- DynamoDB PK: `USER#<userId>` / SK: `SESSION#<sessionId>`

### generate-plan
- DynamoDB に JOB エントリ（status=PENDING）を先に書き込む
- SQS に `{userId, jobId, functionType, variables}` を送信
- PK: `USER#<userId>` / SK: `JOB#<jobId>`

---

## Step 5: フロントエンド実装

### inception.html
- 7 ステップを `#step-{id}[hidden]` で切り替え
- ApologyMeter CSS を `<style>` ブロックに埋め込み
- スクリプト読み込み順: config → facesjs → state → auth → api → avatar → apology-meter → inception

### inception.js
- IIFE パターン（グローバル汚染なし）
- 各 Step コントローラーを関数スコープ内に定義
- `withLoading(buttonId, asyncFn)` でローディング制御
- XSS-01: AI生成テキストは全て `textContent` 使用
- `AbortController` で fetch タイムアウト管理

### apology-meter.js
- prototype/apology-meter.html から STAGES / ZONES / 音声エンジンを移植
- `ApologyMeter.render(containerEl, degree)` で演出付き表示
- `ApologyMeter.getStageInfo(degree)` で情報取得（演出なし）

---

## セキュリティチェックリスト

| 項目 | 対象 |
|-----|------|
| XSS-01: AI生成テキスト textContent | inception.js 全 textContent |
| SECURITY-08: 入力バリデーション | 全 Lambda input_validator |
| AUTH-05: JWT sub 取得 | 全 Lambda requestContext |
| PROMPT-01: プロンプトインジェクション対策 | input_validator.INJECTION_PATTERNS |
| DLQ-01: SQS 失敗時の DLQ | template.yaml（U0実装済み） |
