# U2 NFR 設計パターン
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-05  
> 対象ユニット: U2（コンシェルジュコア）  
> ステータス: 承認待ち

---

## 1. 非同期処理パターン（generate-plan）

U0 NFR Design で定義した SQS 非同期パターンを U2 の `generate-plan` に適用する。

### 適用 Lambda
- `generate-plan`（trigger: fast / 10s）→ SQS → `bedrock-dispatcher`（premium / 29s）

### フロー

```
[FE] inception.js
  │
  │  POST /plan/generate
  │  { incident_summary, opponent_profile, enriched_summary, assessment }
  │
API Gateway → generate-plan trigger Lambda
  │  ・input_validator.py でバリデーション
  │  ・jobId = UUID v4 生成
  │  ・DynamoDB: JOB#<jobId> = PENDING
  │  ・SQS: { jobId, functionType: "generate-plan", payload }
  │  ・即時返却 { "jobId": "...", "status": "PENDING" }
  │
[FE] inception.js ← jobId 受取
  │  → Step 5 に切り替え（プランローディングカード表示）
  │  → pollJob(jobId) 開始（指数バックオフ）
  │
[バックグラウンド]
  SQS → bedrock-dispatcher
    ・DynamoDB: JOB#<jobId> = PROCESSING
    ・generate-plan.txt プロンプトで Sonnet 呼び出し
    ・成功: DynamoDB: JOB#<jobId> = COMPLETED + result
    ・失敗: DynamoDB: JOB#<jobId> = FAILED + error_message
  │
[FE] GET /jobs/<jobId> ポーリング
  │  COMPLETED → ApologyPlan を Step 5 に展開
  │  FAILED / タイムアウト → エラーカード + 「もう一度試す」ボタン
```

### polling 設定（U0 準拠）

```javascript
pollJob(jobId, {
  maxWaitMs: 60000,      // 60秒上限
  baseIntervalMs: 1000,  // 1秒から開始
  maxIntervalMs: 5000,   // 5秒で固定
})
```

---

## 2. 同期 API 呼び出しパターン（assess / probe / opponent）

`assess-apology` / `probe-incident` / `generate-opponent` は同期呼び出し（SQS 不使用）。

### エラーハンドリングパターン

```javascript
// api.js の ApiClient.post() に統合
async function callApi(endpoint, payload) {
  const token = await AuthModule.getAccessToken();  // 自動リフレッシュ込み
  const res = await fetch(API_BASE + endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.message || 'Unknown error');
  }
  return res.json();
}
```

### タイムアウト設定（フロントエンド fetch）

| Lambda | fetch タイムアウト | 根拠 |
|--------|-----------------|------|
| `assess-apology` | 15s | fast 10s + マージン |
| `probe-incident` | 40s | standard 30s + マージン |
| `generate-opponent` | 40s | standard 30s + マージン |

> fetch の AbortController でタイムアウト実装:
> ```javascript
> const controller = new AbortController();
> const timer = setTimeout(() => controller.abort(), timeoutMs);
> const res = await fetch(url, { signal: controller.signal, ...options });
> clearTimeout(timer);
> ```

---

## 3. アバターカスタマイズ描画パターン（リアルタイム）

```javascript
// inception.js 内
function onPresetChange(presetId) {
  const preset = OPPONENT_PRESETS.find(p => p.id === presetId);
  StateManager.get('bossAvatar').faceConfig =
    window.facesjs.override(faceConfig, preset.overrides);
  renderOpponentAvatar();
}

function onSliderChange(param, value) {
  const overrides = { [param]: value };
  StateManager.get('bossAvatar').faceConfig =
    window.facesjs.override(faceConfig, overrides);
  renderOpponentAvatar();
}

function renderOpponentAvatar() {
  // requestAnimationFrame で次フレームに実行（DOM ready 保証）
  requestAnimationFrame(() => {
    window.facesjs.display('opponent-avatar', StateManager.get('bossAvatar').faceConfig);
  });
}
```

---

## 4. DynamoDB アクセスパターン（U2 追加）

U0 の geza-data テーブルに以下のアクセスパターンを追加する。

| パターン | PK | SK | 操作 | Lambda |
|---------|----|----|------|--------|
| セッション保存（Step5） | `USER#<userId>` | `SESSION#<sessionId>` | PutItem | save-session |
| セッション日付更新（Step6） | `USER#<userId>` | `SESSION#<sessionId>` | UpdateItem（apology_date） | save-session |
| ジョブ状態確認（polling） | `USER#<userId>` | `JOB#<jobId>` | GetItem（ConsistentRead=True） | get-job-status |

### SESSION# エントリ構造

```
PK: USER#<userId>
SK: SESSION#<sessionId>

属性:
  incident_summary:   string
  enriched_summary:   string（深掘り完了時）
  ai_degree:          number
  user_degree:        number
  opponent_profile:   JSON string
  apology_plan:       JSON string
  apology_date:       string（ISO8601、Step6 で追加）
  practice_count:     number（初期 0）
  created_at:         ISO8601
  updated_at:         ISO8601
```

---

## 5. フロントエンド ステップ制御パターン

```javascript
// inception.js のステップ管理
const STEPS = ['input', 'probe', 'assessment', 'opponent', 'plan', 'schedule', 'day-support'];

function showStep(stepId) {
  STEPS.forEach(id => {
    document.getElementById(`step-${id}`).hidden = (id !== stepId);
  });
  StateManager.set('inception', 'currentStep', STEPS.indexOf(stepId) + 1);
  window.scrollTo(0, 0);  // ステップ切り替え時にトップへスクロール
}
```

### ローディング状態管理

```javascript
// 各 API 呼び出し中は対象ボタンを無効化 + スピナー表示
function withLoading(buttonId, asyncFn) {
  const btn = document.getElementById(buttonId);
  btn.disabled = true;
  btn.dataset.originalText = btn.textContent;
  btn.textContent = '処理中...';
  return asyncFn().finally(() => {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText;
  });
}
```

---

## 6. セキュリティ設計（U2 固有）

### AI 生成テキストの DOM 挿入（XSS-01）

```javascript
// ✅ 正しい実装（textContent 使用）
document.getElementById('first-words').textContent = plan.first_words;
document.getElementById('full-script').textContent = plan.full_script;

// ❌ 禁止（innerHTML 使用）
// document.getElementById('full-script').innerHTML = plan.full_script;
```

> AI 生成テキストは信頼できないユーザー入力を含む可能性があるため、たとえ AI 出力でも `textContent` で挿入する。

### probe 回答バリデーション（Q2: A）

```javascript
function onProbeSubmit(e) {
  e.preventDefault();
  const answer = document.getElementById('probe-answer').value.trim();
  if (!answer) {
    document.getElementById('probe-error').textContent = '回答を入力してください';
    return;
  }
  if (answer.length > 500) {
    document.getElementById('probe-error').textContent = '500文字以内で入力してください';
    return;
  }
  // ... API 呼び出し
}
```
