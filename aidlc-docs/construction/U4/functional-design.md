# U4 Functional Design
> AI-DLC CONSTRUCTION Phase — Functional Design 成果物  
> ユニット: U4 謝罪後支援 + カルテ  
> 生成日: 2026-05-10  
> ステータス: 承認待ち

---

## 設計方針サマリー

| 決定事項 | 内容 |
|---------|------|
| feedback 拡張 | feedback.html（U3: 練習結果概要）は保持。詳細専用 `feedback-detail.html` を新規作成（Q1=B） |
| フィードバック系 API | generate-prevention / generate-follow-mail を別 Lambda として実装。ボタン押下時に個別呼び出し（Q2=B） |
| チェックリスト方式 | 固定テンプレ5項目 + AI 追加項目（generate-prevention が返却）（Q3=C） |
| セッション保存トリガー | U2完了時（既存）+ U3完了時（practice_result / feedback_result）+ 謝罪完了ボタン（actual_result）（Q4=C + 謝罪完了） |
| カルテ設計 | 謝罪後の実際の結果を蓄積。case-detail.html に「謝罪完了を記録する」ボタンを追加（Q5=Custom） |
| analyze-karte | U4 MVP で実装（Nova Lite が蓄積セッションを分析し傾向コメントを生成）（Q6=A） |
| DynamoDB 保存内容 | メタデータ + generate-feedback 返却結果（problems / improved_apology_text / overall_comment）（Q7=B） |
| フォローメール文体 | opponentProfile の情報をもとに AI が適切な敬語レベルで自動判断（Q8=A） |

---

## Step 1: ドメインモデル

### エンティティ

#### CarteEntry（DynamoDB セッション拡張属性）

U0/U2 で定義済みの DynamoDB アイテム（`USER#{sub}` / `SESSION#{sessionId}`）に以下フィールドを追加:

| フィールド | 型 | 追加タイミング | 説明 |
|-----------|:--:|:----------:|------|
| `apology_status` | string | U2/U3/謝罪完了 | `"planned"` / `"practiced"` / `"completed"` |
| `practice_result` | JSON string | U3完了時 | `{final_angry, final_trust, turn_count, ng_count, session_result}` |
| `feedback_result` | JSON string | U3完了時 | `{problems[], improved_apology_text, overall_comment}` |
| `actual_result` | JSON string | 謝罪完了ボタン | `{outcome, notes, completed_at}` |

#### PreventionPlan（フロントエンドメモリ）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| `checklist_fixed` | `{id, text, done}[]` | 固定5項目チェックリスト |
| `checklist_ai` | `{text, done}[]` | AI 生成追加項目 |
| `prevention_steps` | `{step, detail}[]` | 再発防止策ステップ |
| `summary` | string | 全体まとめ（AI 生成） |

#### FollowMail（フロントエンドメモリ）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| `subject` | string | 件名 |
| `body` | string | 本文（AI 生成） |

#### ActualResult（謝罪完了記録）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| `outcome` | string | `"success"` / `"partial"` / `"failed"` |
| `notes` | string | 実施メモ（任意・最大500文字） |
| `completed_at` | string | ISO 日時 |

---

## Step 2: ユースケース

### UC-01: 再発防止策・チェックリスト生成（US-501, US-209）

```
前提条件:
  - ユーザーが Cognito 認証済み
  - feedback.html から「詳細フィードバックを見る」ボタン経由で feedback-detail.html に遷移
  - sessionStorage に "practiceResult" と "geza_current_case_id" が存在する

フロー:
  1. feedback-detail.html 読み込み
  2. requireAuth() → 未認証は index.html へリダイレクト
  3. sessionStorage から practiceResult / opponentProfile を読み取り
  4. 固定チェックリスト5項目を即座に描画（ローディング不要）:
     ① 謝罪の言葉を頭に入れた
     ② 相手の都合を確認した
     ③ 謝罪場所・状況を整えた
     ④ 再発防止策を考えた
     ⑤ 追加質問への回答を準備した
  5. 「再発防止策を生成する」ボタン押下（初回のみ） →
     POST /prevention/generate を呼び出し:
       Request: { conversation_history, opponent_profile, problems, final_trust_score }
       Response: { checklist_ai[], prevention_steps[], summary }
  6. AI 追加チェックリスト項目を固定項目の下に追記
  7. 再発防止策ステップをリスト表示（textContent）
  8. 各チェックリスト項目のチェック状態は localStorage "geza_checklist_{caseId}" に保存
```

### UC-02: フォローメール生成（US-502）

```
フロー:
  1. feedback-detail.html の「フォローメール」タブを選択
  2. 「フォローメールを生成する」ボタン押下 →
     POST /mail/generate を呼び出し:
       Request: { opponent_profile, problems, improved_apology_text, final_trust_score }
       Response: { subject, body }
  3. 件名・本文をテキスト表示（textContent）
  4. 「クリップボードにコピー」ボタン → navigator.clipboard.writeText() でコピー
     ※ クリップボード API は外部送信ではなくローカル操作のためセキュリティ問題なし
```

### UC-03: U3完了時のセッション自動更新（US-601 一部）

```
フロー（feedback.js の _loadAndRenderFeedback 完了後）:
  1. sessionStorage から "geza_current_case_id" を取得
  2. session_id が存在する場合のみ実行:
     PUT save-session (UPDATE モード):
       {
         session_id: <id>,
         practice_result: JSON.stringify({ final_angry, final_trust, turn_count, ng_count, session_result }),
         feedback_result: JSON.stringify({ problems, improved_apology_text, overall_comment }),
         apology_status: "practiced"
       }
  3. エラーは silent（カルテ保存失敗でも練習フィードバック表示は継続）
```

### UC-04: 謝罪完了記録（US-601 残り・Q5設計）

```
前提条件:
  - ユーザーが case-detail.html を表示中
  - _case.id（session_id）が存在する

フロー:
  1. 「謝罪完了を記録する」ボタン押下
  2. 「謝罪完了記録」モーダルが開く:
     - 謝罪結果（3択ラジオ）:
         ✅ 解決した（success）
         ⚡ 部分的に解決した（partial）
         ❌ まだ解決していない（failed）
     - 実施メモ（textarea、任意・最大500文字）
  3. 「記録する」ボタン押下 →
     PUT save-session (UPDATE モード):
       {
         session_id: _case.id,
         actual_result: JSON.stringify({ outcome, notes, completed_at }),
         apology_status: "completed"
       }
  4. 成功時: モーダルを閉じ、case-detail.html のステータスバッジを「謝罪完了」に更新
  5. ローカルケースデータも同期更新（localStorage "geza_cases"）
```

### UC-05: カルテ一覧表示（US-602）

```
フロー:
  1. carte.html 読み込み
  2. requireAuth() → 未認証リダイレクト
  3. GET /karte を呼び出し → ユーザーの全セッション取得:
     Response: {
       sessions: [{
         session_id, incident_summary, ai_degree, apology_status,
         opponent_profile_summary, practice_result, feedback_result, actual_result,
         created_at, updated_at
       }]
     }
  4. セッションを updated_at 降順に表示:
     - カード形式: 案件概要 / 謝罪角度 / ステータスバッジ / 謝罪完了日（あれば）
     - ステータスバッジ: 📋 プラン作成済み / 🎯 リハーサル済み / ✅ 謝罪完了
  5. カード押下 → case-detail.html へ遷移（sessionStorage に session_id を設定）
  6. 「傾向を分析する」ボタン押下 → UC-06 へ
```

### UC-06: 傾向分析（US-602 拡張）

```
フロー:
  1. 「傾向を分析する」ボタン押下 → ローディング表示
  2. GET /karte/analyze を呼び出し:
     Response: { trend_comment, weak_points[], strong_points[], advice }
  3. 傾向コメント・弱点・強みをテキスト表示（textContent）
  4. 2回目以降: キャッシュ（sessionStorage "karteAnalysis"）があれば API を呼ばない
```

### UC-07: API 障害フォールバック

```
generate-prevention / generate-follow-mail エラー時:
  - エラーメッセージを表示（「生成に失敗しました。再試行してください。」）
  - 「再試行する」ボタンを表示
  - 前回成功した結果があれば保持（再実行しない）

save-session UPDATE エラー時（UC-03）:
  - Silent fail（ユーザーにエラーを通知しない）
  - CloudWatch Logs にエラー記録のみ

save-session UPDATE エラー時（UC-04）:
  - モーダル内にエラーメッセージを表示（「記録に失敗しました。再試行してください。」）
  - モーダルを閉じない（データが失われないよう）
```

---

## Step 3: 画面仕様

### 3-1: feedback.html（U3 実装済み → 拡張）

追加: フィードバックカードの下部に「詳細フィードバックを見る」ボタンを追加。

```
[既存セクション（変更なし）]
  スコアサマリー / 問題点リスト / AI改善謝罪文 / 全体コメント

[追加ボタン]
  [📋 詳細フィードバックを見る] ← feedback-detail.html へ遷移
  [再挑戦する] [トップへ戻る]
```

### 3-2: feedback-detail.html（新規）

```
[ヘッダー]
  <h1>詳細フィードバック</h1>

[タブ]
  [✅ チェックリスト・再発防止策] [📧 フォローメール]

[チェックリストタブ（デフォルト）]
  ■ 謝罪前チェックリスト
    □ 謝罪の言葉を頭に入れた
    □ 相手の都合を確認した
    □ 謝罪場所・状況を整えた
    □ 再発防止策を考えた
    □ 追加質問への回答を準備した
    --- AI 生成追加項目（ロード後に挿入） ---

  [再発防止策を生成する] ← 初回のみ。生成後は非表示

  ■ 再発防止策（生成後に表示）
    1. xxxxxx
    2. xxxxxx

[フォローメールタブ]
  [フォローメールを生成する] ← 初回のみ。生成後は非表示

  件名: xxxxxxxxxx
  ─────────────────
  xxxxxxxxxx
  xxxxxxxxxx

  [📋 クリップボードにコピー]

[ボタン]
  [← 練習フィードバックへ戻る]
```

### 3-3: case-detail.html（拡張）

追加: アクションボタンエリアに「謝罪完了を記録する」ボタン追加。

```
[既存コンテンツ（変更なし）]

[アクションボタン追加]
  [📝 謝罪完了を記録する]  ← クリックでモーダル表示

[謝罪完了モーダル]
  ■ 謝罪結果
    ( ) ✅ 解決した
    ( ) ⚡ 部分的に解決した
    ( ) ❌ まだ解決していない

  ■ 実施メモ（任意）
  <textarea maxlength="500" placeholder="どのような結果でしたか...">

  [記録する] [キャンセル]
```

### 3-4: carte.html（新規）

```
[ヘッダー]
  <h1>謝罪カルテ</h1>

[傾向分析エリア]
  [📊 傾向を分析する] ← 押下で analyze-karte 呼び出し

  （分析結果表示エリア。生成後に挿入）
  傾向コメント: xxxxxxxx
  弱点: xxxxxxxx / 強み: xxxxxxxx / アドバイス: xxxxxxxx

[セッション一覧]
  ┌────────────────────────────────────────┐
  │ 📋 プラン作成済み   2026-05-10         │
  │ 同僚との連絡トラブル（謝罪角度: 75°）  │
  └────────────────────────────────────────┘
  ┌────────────────────────────────────────┐
  │ ✅ 謝罪完了   2026-05-08               │
  │ 上司への遅刻詫び（謝罪角度: 45°）      │
  │ 結果: 解決した                         │
  └────────────────────────────────────────┘
  ...

[セッションなし時]
  「まだ謝罪案件がありません」
  [最初の謝罪案件を作成する] → inception.html
```

---

## Step 4: コンポーネント設計

### 4-1: FeedbackDetailPageController（新規）

```javascript
class FeedbackDetailPageController {
  constructor(auth, apiClient)

  /** 初期化。sessionStorage から practiceResult を読み取り */
  async init()

  /** タブ切り替え */
  _switchTab(tabName)  // "checklist" | "mail"

  /** 固定チェックリストを描画 */
  _renderFixedChecklist()

  /** チェック状態の localStorage 保存 */
  _saveChecklistState(id, done)

  /** 再発防止策 API 呼び出し → 描画 */
  async _generatePrevention()

  /** フォローメール API 呼び出し → 描画 */
  async _generateFollowMail()

  /** クリップボードコピー */
  _copyToClipboard(text)
}
```

### 4-2: CartePageController（新規）

```javascript
class CartePageController {
  constructor(auth, apiClient)

  /** 初期化。GET /karte を呼び出しカード一覧を描画 */
  async init()

  /** セッションカード一覧描画 */
  _renderSessionCards(sessions)

  /** セッションカードクリック → case-detail.html へ遷移 */
  _navigateToCase(sessionId)

  /** 傾向分析 API 呼び出し → 描画 */
  async _analyzeKarte()
}
```

### 4-3: FeedbackPageController 拡張（feedback.js）

追加メソッド:

```javascript
/** 詳細フィードバックへの遷移ボタンを描画 */
_renderDetailButton()

/** U3 完了後に save-session UPDATE を呼び出す（silent） */
async _savePracticeResult(feedbackData, apiResult)
```

### 4-4: CaseDetailPageController 拡張（case-detail.js）

追加メソッド:

```javascript
/** 「謝罪完了を記録する」ボタンを表示 */
_renderCompleteButton()

/** 謝罪完了モーダルを表示 */
_openCompleteModal()

/** 謝罪完了 API 呼び出し → ステータス更新 */
async _handleCompleteSubmit(outcome, notes)
```

---

## Step 5: API 仕様（U4 使用分）

### POST `/prevention/generate`（U4 で実装）

| 項目 | 値 |
|-----|---|
| Lambda | generate-prevention |
| LLM モデル | Claude Sonnet（premium プロファイル） |
| タイムアウト | 29s |

**Request:**
```json
{
  "conversation_history": [...],
  "opponent_profile": { "type": "上司", "anger_level": 65 },
  "problems": ["事実認定が曖昧", "再発防止策の言及なし"],
  "final_trust_score": 82
}
```

**Response:**
```json
{
  "checklist_ai": [
    { "text": "具体的な再発防止策を3点以上準備する" },
    { "text": "改善後の進捗を1週間後に報告することを約束する" }
  ],
  "prevention_steps": [
    { "step": "1", "detail": "ダブルチェック体制の導入（期限: 今週中）" },
    { "step": "2", "detail": "週次進捗報告ミーティングの設定（期限: 来週から）" }
  ],
  "summary": "今回のやらかしの根本原因は確認プロセスの欠如です。..."
}
```

### POST `/mail/generate`（U4 で実装）

| 項目 | 値 |
|-----|---|
| Lambda | generate-follow-mail |
| LLM モデル | Claude Sonnet（premium プロファイル） |
| タイムアウト | 29s |

**Request:**
```json
{
  "opponent_profile": { "type": "上司", "name": "田中部長" },
  "problems": ["再発防止策の言及なし"],
  "improved_apology_text": "この度はご迷惑をおかけし...",
  "final_trust_score": 82
}
```

**Response:**
```json
{
  "subject": "先ほどの件について — 再発防止策のご報告",
  "body": "田中部長\n\n先ほどはご丁寧にご対応いただきありがとうございました。..."
}
```

### PUT `/session/update`（save-session Lambda 拡張）

既存の save-session Lambda の UPDATE モードを拡張する。`_SCHEMA_UPDATE` に以下フィールドを追加:

| フィールド | 型 | 用途 |
|-----------|:--:|------|
| `practice_result` | string（JSON） | U3完了時に保存（no_html_escape: True） |
| `feedback_result` | string（JSON） | U3完了時に保存（no_html_escape: True） |
| `actual_result` | string（JSON） | 謝罪完了ボタン押下時（no_html_escape: True） |
| `apology_status` | string | `"practiced"` / `"completed"` |

既存の `session_id` + `incident_summary` なし → UPDATE の判定ロジックはそのまま利用。

### GET `/karte`（U4 で実装）

| 項目 | 値 |
|-----|---|
| Lambda | get-karte |
| データソース | DynamoDB Query（pk = `USER#{sub}`、sk begins_with `SESSION#`） |
| タイムアウト | 10s（fast） |

**Response:**
```json
{
  "sessions": [
    {
      "session_id": "...",
      "incident_summary": "同僚との連絡トラブル",
      "ai_degree": 75,
      "apology_status": "completed",
      "practice_result": { "final_angry": 15, "final_trust": 85, "turn_count": 7 },
      "actual_result": { "outcome": "success", "completed_at": "2026-05-08T..." },
      "created_at": "2026-05-08T...",
      "updated_at": "2026-05-08T..."
    }
  ]
}
```

### GET `/karte/analyze`（U4 で実装）

| 項目 | 値 |
|-----|---|
| Lambda | analyze-karte |
| LLM モデル | amazon.nova-lite-v1:0（fast プロファイル） |
| タイムアウト | 10s |
| 条件 | セッション数 ≥ 2 でのみ LLM 分析を実行。1件の場合は固定メッセージを返す。 |

**Response:**
```json
{
  "trend_comment": "謝罪練習のスコアが全体的に改善傾向にあります。",
  "weak_points": ["初動の謝罪が遅い傾向", "再発防止策の具体性が不足"],
  "strong_points": ["誠意は一貫して伝わっている"],
  "advice": "まず事実認定を明確にしてから謝罪を始めると信頼度が上がりやすいです。"
}
```

---

## Step 6: DynamoDB 更新パターン

### save-session UPDATE 拡張

U3完了時（feedback.js から呼び出し）:
```python
UpdateExpression = "SET #ua = :ua, #pr = :pr, #fr = :fr, #as = :as"
ExpressionAttributeNames = {
    "#ua": "updated_at",
    "#pr": "practice_result",
    "#fr": "feedback_result",
    "#as": "apology_status",
}
```

謝罪完了時（case-detail.js から呼び出し）:
```python
UpdateExpression = "SET #ua = :ua, #ar = :ar, #as = :as"
ExpressionAttributeNames = {
    "#ua": "updated_at",
    "#ar": "actual_result",
    "#as": "apology_status",
}
```

### get-karte クエリ

```python
response = table.query(
    KeyConditionExpression=Key("pk").eq(f"USER#{user_id}") & Key("sk").begins_with("SESSION#"),
    ScanIndexForward=False,  # updated_at 降順はアプリ側でソート
    Limit=50,
)
```

---

## Step 7: セキュリティコンプライアンス

| ID | 対策 | 実装箇所 |
|---|------|---------|
| XSS-01 | AI 生成テキスト（prevention_steps / follow_mail body / trend_comment）はすべて `textContent` で挿入 | feedback-detail.js / carte.js |
| XSS-02 | ユーザー入力（実施メモ）は `textContent` で表示。DynamoDB 保存前に input_validator で検証 | case-detail.js / save-session |
| AUTH-05 | `requireAuth()` を各ページ先頭で呼び出し | feedback-detail.js / carte.js |
| SECURITY-08 | generate-prevention / generate-follow-mail Lambda で `input_validator.validate()` を適用 | backend |
| PROMPT-01 | `input_validator.INJECTION_PATTERNS` によるプロンプトインジェクション対策を全 Lambda 側で適用 | backend |
| PRIVACY-01 | actual_result.notes は DynamoDB に保存。機密情報（個人名・社名）は入力欄に注記「実名を含めないことを推奨」 | case-detail.html |
| SEC-CLIPBOARD | navigator.clipboard.writeText() はユーザーのローカル操作のみ。外部送信なし | feedback-detail.js |

---

## 成果物サマリー

| ファイル | 新規/更新 | 概要 |
|---------|:-------:|------|
| `frontend/pages/feedback-detail.html` | **新規** | 詳細フィードバック画面（再発防止策・フォローメール・チェックリスト） |
| `frontend/pages/feedback-detail.js` | **新規** | FeedbackDetailPageController |
| `frontend/pages/carte.html` | **新規** | 謝罪カルテ一覧画面 |
| `frontend/pages/carte.js` | **新規** | CartePageController |
| `frontend/pages/feedback.js` | **更新** | 詳細フィードバックへのリンクボタン追加 + _savePracticeResult() |
| `frontend/pages/case-detail.js` | **更新** | 謝罪完了モーダル追加 + _handleCompleteSubmit() |
| `frontend/pages/case-detail.html` | **更新** | 謝罪完了ボタン追加 + 謝罪完了モーダル HTML |
| `backend/functions/generate-prevention/lambda_function.py` | **実装** | Claude Sonnet 再発防止策・チェックリスト生成 |
| `backend/functions/generate-follow-mail/lambda_function.py` | **実装** | Claude Sonnet フォローメール生成 |
| `backend/functions/get-karte/lambda_function.py` | **実装** | DynamoDB カルテ一覧取得 |
| `backend/functions/analyze-karte/lambda_function.py` | **実装** | Nova Lite 謝罪傾向分析 |
| `backend/functions/save-session/lambda_function.py` | **更新** | practice_result / feedback_result / actual_result / apology_status フィールド追加 |
| `backend/prompts/generate_prevention.txt` | **新規** | 再発防止策・チェックリストプロンプト |
| `backend/prompts/generate_follow_mail.txt` | **新規** | フォローメール生成プロンプト |
| `backend/prompts/analyze_karte.txt` | **新規** | 謝罪傾向分析プロンプト |

---

## U4 Post-Code-Generation 追加実装（2026-05-10）

Code Generation 完了後に確認されたバグ修正・機能拡張をまとめる。

### Bug修正

| 対象 | 問題 | 修正内容 |
|------|------|---------|
| `case-detail.js` | ApiClient.put が存在しない | `ApiClient.post("/sessions", ...)` に変更 |
| `case-detail.js` | キャッシュミス時にデータなし | `/sessions` API フォールバック追加 |
| `get-sessions` | `apologyStatus` / `mailThread` フィールド欠落 | レスポンスに追加 |
| `get-karte` | `mail_thread` フィールド欠落 | レスポンスに追加 |

### 新機能: メールスレッド管理（generate-mail-reply Lambda）

フォローメール後の返信対応を支援するため、メールスレッド機能を追加。

**バックエンド**:
- `backend/functions/generate-mail-reply/lambda_function.py`: POST /mail/reply（Claude Sonnet premium）
- `backend/prompts/generate_mail_reply.txt`: メール返信生成プロンプト
- `template.yaml`: GenerateMailReplyFunction 追加（1024MB/29s）

**フロントエンド**:
- `frontend/pages/mail-thread.html`: メールスレッド管理画面（受信メール入力 → AI 返信生成 → 編集 → 保存 → スレッド表示）
- `frontend/pages/mail-thread.js`: MailThreadController
  - `_generateReply()`: POST /mail/reply
  - `_saveReply()`: localStorage 保存（`geza_mail_thread_{caseId}`）
  - `_saveMailThreadToServer()`: save-session 経由で DynamoDB 保存

**case-detail.html/js 拡張**:
- フォローメール・メール対応ボタン追加
- `_updateMailThreadBadge()`: `geza_mail_thread_{id}` からスレッド数を読んでバッジ表示
- consult-plan への `mail_thread_summary` 送信対応

**consult-plan 拡張**:
- `mail_thread_summary` フィールド対応
- `consult_plan.txt` にメールスレッド要約セクション追加

### 新機能: カルテ専用詳細 UI（karte-detail.html/js）

カルテ一覧から案件詳細へのナビゲーション先を、実案件モード（case-detail.html）ではなくカルテ専用の読み取り専用 UI に変更。

**フロントエンド**:
- `frontend/pages/karte-detail.html`: カルテ詳細ビュー（読み取り専用）
  - セクション: ヒーロー（ステータスバッジ・謝罪角度バッジ）/ 事案概要 / 相手プロフィール / リハーサル記録 / 実際の謝罪記録 / メールやり取り / 削除ボタン・実案件リンク
- `frontend/pages/karte-detail.js`: KarteDetailController
  - `init()`: `StateManager.getPersistent("karteCurrentSession")` でデータ取得。なければ `carte.html` にリダイレクト
  - XSS-01 準拠: 全 DOM 挿入は `textContent` のみ

**carte.html/js 機能追加（4要件）**:
- 削除機能: `_deleteKarteEntry()` → `geza_deleted_cases` localStorage 更新 + カード除去
- フィルタ: `_loadKarte()` で deletedIds を除外（実案件モードで削除した案件も除外）
- ステータス修正: `effectiveStatus` を `geza_completed_{id}` localStorage から判定（謝罪完了済みをカルテに正しく反映）
- 遷移: カードクリック → `StateManager.setPersistent("karteCurrentSession", data)` → `karte-detail.html` へ

| ファイル | 新規/更新 | 概要 |
|---------|:-------:|------|
| `frontend/pages/karte-detail.html` | **新規** | カルテ専用詳細ビュー（読み取り専用） |
| `frontend/pages/karte-detail.js` | **新規** | KarteDetailController |
| `frontend/pages/carte.js` | **更新** | 削除・フィルタ・ステータス・karte-detail 遷移 |
| `frontend/pages/carte.html` | **更新** | .karte-card-actions / .karte-delete-btn CSS 追加 |
| `frontend/pages/mail-thread.html` | **新規** | メールスレッド管理画面 |
| `frontend/pages/mail-thread.js` | **新規** | MailThreadController |
| `frontend/pages/case-detail.html` | **更新** | フォローメール・メール対応ボタン追加 |
| `frontend/pages/case-detail.js` | **更新** | mail_thread_summary 送信 / _updateMailThreadBadge / ApiClient.put → post 修正 |
| `frontend/pages/feedback-detail.html` | **更新** | フォローメール・再発防止策の表示ページ追加 |
| `frontend/pages/feedback-detail.js` | **更新** | _saveFollowMailToThread() / feedbackDetailSource 制御 |
| `backend/functions/generate-mail-reply/lambda_function.py` | **新規** | メール返信生成（Claude Sonnet） |
| `backend/prompts/generate_mail_reply.txt` | **新規** | メール返信プロンプト |
| `backend/functions/get-sessions/lambda_function.py` | **更新** | apologyStatus / mailThread フィールド追加 |
| `backend/functions/consult-plan/lambda_function.py` | **更新** | mail_thread_summary 対応 |
| `backend/prompts/consult_plan.txt` | **更新** | mail_thread_summary セクション追加 |
| `template.yaml` | **更新** | GenerateMailReplyFunction / GenerateMailReplyLogGroup 追加 |
