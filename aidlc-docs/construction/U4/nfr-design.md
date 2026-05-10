# U4 NFR Design
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-10  
> 対象ユニット: U4（謝罪後支援 + カルテ）  
> ステータス: 承認済み

---

## U0 NFR Design パターンの継承

U0 で確定済みの以下パターンを U4 でも使用する（変更なし）。

| パターン | 内容 | U4 適用箇所 |
|---------|------|------------|
| 非同期 SQS パターン | premium Lambda（Sonnet）は trigger → SQS → bedrock-dispatcher | **generate-prevention / generate-follow-mail** は同期29sのため**非適用**（NFR Requirements Q1=A で同期確定） |
| 指数バックオフポーリング | GET /jobs/{jobId} で 1s→2s→4s... | U4 では非同期使用なし |
| DynamoDB JOB# SK | 非同期ジョブ状態管理 | U4 では非適用 |
| Bedrock リトライ | ThrottlingException: 指数バックオフ最大3回 | get-karte（DynamoDB のみ）/ analyze-karte（Nova Lite）に適用 |
| CF キャッシュ | HTML TTL=0 / 静的アセット TTL=1年 | feedback-detail.html / carte.html も同設定 |
| DynamoDB 整合性 | 書き込み後読み取りのみ ConsistentRead=True | save-session UPDATE 後の get-karte には適用しない（即時読み取り不要） |
| FE エラー回復 | エラーバナー + 手動リトライボタン | generate-prevention / generate-follow-mail / analyze-karte |

---

## 1. generate-prevention / generate-follow-mail — 同期呼び出し設計

### 呼び出しフロー

```
Client (feedback-detail.js)
  │
  │ POST /prevention/generate  または  POST /mail/generate
  │ { conversation_history, opponent_profile, problems, final_trust_score }
  │
API Gateway HTTP API v2（29s タイムアウト）
  │ Cognito JWT 認証
  │
generate-prevention Lambda（1024MB / 29s / Claude Sonnet）
  │ 1. input_validator.validate() — 入力サニタイズ
  │ 2. prompt_loader.load("generate_prevention.txt") — S3 from prompts bucket
  │ 3. bedrock_client.converse(model="claude-sonnet-*", max_tokens=2048)
  │ 4. JSON レスポンスをパース・返却
  │ 推定所要時間: 15〜20s
  │
  └──> { checklist_ai[], prevention_steps[], summary }
```

### UI ローディング制御

```javascript
// feedback-detail.js
async _generatePrevention() {
  const btn = document.getElementById("btn-generate-prevention");
  btn.disabled = true;
  btn.textContent = "AIが分析中...";

  try {
    const result = await ApiClient.post("/prevention/generate", payload);
    _renderPrevention(result);
    btn.style.display = "none"; // 生成済み → 非表示
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "再試行する";
    _showError("生成に失敗しました。再試行してください。");
  }
}
```

---

## 2. get-karte — DynamoDB Query 設計

### クエリパターン

```python
# get-karte/lambda_function.py
response = table.query(
    KeyConditionExpression=Key("pk").eq(f"USER#{user_id}") & Key("sk").begins_with("SESSION#"),
    ScanIndexForward=False,   # sk 降順（SESSION#<uuid> は作成順に近似）
    Limit=50,
)
# updated_at 降順に Python 側でソート
sessions = sorted(
    response["Items"],
    key=lambda x: x.get("updated_at", ""),
    reverse=True,
)
```

**注意**: DynamoDB の sk は UUID ランダム順のため `ScanIndexForward=False` だけでは updated_at 降順にならない。  
Limit=50 で全件取得後、アプリケーション層でソートする。

### レスポンス整形

```python
def _format_session(item):
    """DynamoDB Item → カルテ一覧用レスポンス形式に変換"""
    def _parse_json(raw):
        try:
            return json.loads(raw) if raw else None
        except Exception:
            return None

    return {
        "session_id":   item.get("session_id", ""),
        "incident_summary": item.get("incident_summary", ""),
        "ai_degree":    int(item.get("ai_degree") or 0),
        "apology_status": item.get("apology_status", "planned"),
        "practice_result": _parse_json(item.get("practice_result")),
        "actual_result":   _parse_json(item.get("actual_result")),
        "created_at":   item.get("created_at", ""),
        "updated_at":   item.get("updated_at", ""),
    }
```

---

## 3. analyze-karte — Nova Lite 傾向分析設計

### 呼び出しフロー

```
Client (carte.js)
  │
  │ 1. sessionStorage["karteAnalysis"] を確認
  │    → あれば API 呼び出しをスキップして表示
  │
  │ GET /karte/analyze
  │
analyze-karte Lambda（256MB / 10s / Nova Lite）
  │ 1. DynamoDB Query（get-karte と同じクエリ）
  │ 2. sessions.length < 2 → 固定メッセージ返却（Bedrock 呼び出しなし）
  │ 3. sessions 概要をプロンプトに埋め込み
  │    （session_id / ai_degree / apology_status / practice_result.final_trust のみ送信）
  │ 4. bedrock_client.converse(model="nova-lite", max_tokens=512)
  │
  └──> { trend_comment, weak_points[], strong_points[], advice }

Client
  │ sessionStorage["karteAnalysis"] に保存
  │ 謝罪完了記録（actual_result 保存）時: sessionStorage.removeItem("karteAnalysis")
```

### セッション数不足時の固定メッセージ

```python
if len(sessions) < 2:
    return success_response({
        "trend_comment": "謝罪カルテが1件以上蓄積されると、傾向分析が利用できます。",
        "weak_points": [],
        "strong_points": [],
        "advice": "まず実際の謝罪結果を記録して、カルテを積み上げましょう。",
    })
```

---

## 4. save-session UPDATE 拡張設計

### _SCHEMA_UPDATE への追加フィールド

```python
_SCHEMA_UPDATE = {
    "session_id":       {"type": "str", "required": True},
    "apology_date":     {"type": "str", "required": False},
    "practice_count":   {"type": "int", "required": False},
    # ── U4 追加 ──
    "practice_result":  {"type": "str", "required": False, "no_html_escape": True},
    "feedback_result":  {"type": "str", "required": False, "no_html_escape": True},
    "actual_result":    {"type": "str", "required": False, "no_html_escape": True},
    "apology_status":   {"type": "str", "required": False},
}
```

### UpdateExpression 生成ロジック（既存パターン踏襲）

```python
# U4 追加ブランチを既存の UpdateExpression 生成に追記
for field, attr in [
    ("practice_result",  "#pres"),
    ("feedback_result",  "#fres"),
    ("actual_result",    "#ares"),
    ("apology_status",   "#astat"),
]:
    if field in validated:
        update_expr += f", {attr} = :{attr[1:]}"
        expr_names[attr]    = field
        expr_values[f":{attr[1:]}"] = validated[field]
```

### apology_status 許容値バリデーション

```python
VALID_STATUSES = {"planned", "practiced", "completed"}
if "apology_status" in validated:
    if validated["apology_status"] not in VALID_STATUSES:
        raise ValidationError(f"apology_status must be one of {VALID_STATUSES}")
```

---

## 5. フロントエンド状態管理パターン（U4 追加）

### analyze-karte キャッシュライフサイクル

```javascript
// carte.js
async _analyzeKarte() {
  // キャッシュ確認
  const cached = StateManager.getPersistent("karteAnalysis");
  if (cached) { _renderAnalysis(cached); return; }

  // API 呼び出し
  const result = await ApiClient.get("/karte/analyze");
  StateManager.setPersistent("karteAnalysis", result);
  _renderAnalysis(result);
}

// case-detail.js — 謝罪完了記録後にキャッシュ破棄
async _handleCompleteSubmit(outcome, notes) {
  await ApiClient.put("/session/update", { session_id, actual_result, apology_status: "completed" });
  StateManager.removePersistent("karteAnalysis"); // 傾向分析キャッシュ無効化
  _updateStatusBadge("completed");
}
```

### チェックリスト状態管理

```javascript
// feedback-detail.js — localStorage キー規則
const CHECKLIST_KEY = `geza_checklist_${caseId}`;

function _saveCheckState(id, done) {
  const state = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
  state[id] = done;
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
}

function _loadCheckState() {
  return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
}
```

---

## 6. エラーハンドリング設計（U4 固有）

| シナリオ | Lambda 側 | FE 側 |
|---------|----------|-------|
| generate-prevention タイムアウト | `handle_errors` デコレータが 500 返却 | エラーバナー + ボタンを「再試行する」に変更 |
| save-session UPDATE 失敗（practice_result） | 500 返却 | Silent fail（ユーザー通知なし）。CloudWatch に error ログ |
| save-session UPDATE 失敗（actual_result） | 500 返却 | モーダル内エラー表示。モーダルは閉じない |
| get-karte 0件 | 200 + `{ sessions: [] }` | 「まだ謝罪案件がありません」メッセージ表示 |
| analyze-karte sessions < 2 | 200 + 固定メッセージ | キャッシュなし（再呼び出しで更新） |

---

## セキュリティ・PBT コンプライアンスサマリー

| 観点 | 状態 | 備考 |
|------|:----:|------|
| SEC-U4-03 / 04（sub フィルタ） | ✅ 設計済み | get-karte / analyze-karte 共に DynamoDB pk=`USER#{sub}` でフィルタ |
| SEC-U4-05（no_html_escape） | ✅ 設計済み | practice_result / feedback_result / actual_result |
| apology_status 列挙値検証 | ✅ 設計済み | `{"planned", "practiced", "completed"}` のみ許可 |
| PBT（get-karte 件数 ≤ 50） | ✅ Limit=50 を Query に指定 |
| PBT（actual_result.notes ≤ 500文字） | ✅ input_validator で制限 |
