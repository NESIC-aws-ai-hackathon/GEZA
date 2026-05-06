# U2-EXT Functional Design
> AI-DLC CONSTRUCTION Phase — Functional Design 成果物  
> ユニット: U2-EXT 継続的相談機能（プラン再調整チャット）  
> 生成日: 2026-05-06  
> ステータス: 承認待ち

---

## 設計方針サマリー

| 決定事項 | 内容 |
|---------|------|
| 機能位置 | U2のStep 5（謝罪プラン）セクション内に「相談する」エリアを追加 |
| チャット形式 | マルチターン（会話履歴を保持、最大10ターン） |
| APIパターン | 同期（30s以内で完結）|
| モデル | Claude Haiku 4.5（standard profile） |
| セッション連携 | _sessionId・_apologyPlan・_opponentProfile をコンテキストとして送信 |
| レスポンス形式 | { advice: string, revised_plan: object|null } |
| UI | プランカードの下にチャット折りたたみパネル |

---

## Step 1: ドメインモデル

### ConsultMessage（相談メッセージ）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| role | "user" \| "assistant" | 発言者 |
| content | string | メッセージ本文（最大1000文字） |

### ConsultResponse（AI応答）

| フィールド | 型 | 必須 | 説明 |
|-----------|:--:|:----:|------|
| advice | string | ✓ | 状況に応じたアドバイス・返答（200〜500字） |
| revised_plan | object \| null | — | プランを修正する場合のみ返す（first_words/full_script等を部分更新） |

---

## Step 2: ユースケース

### UC-EXT-01: 現在の状況を相談してプランを調整する

**アクター**: ユーザー  
**前提**: U2のStep 5（謝罪プラン）が表示済み  

**基本フロー**:  
1. ユーザーが「💬 AIに相談する」ボタンをクリック → 相談パネルが展開  
2. ユーザーが現在の状況を入力（例：「謝罪しようとしたが相手が席を外していた」）  
3. システムがAIに送信（セッションコンテキスト + 会話履歴込み）  
4. AIが状況に応じたアドバイスを返答  
5. プラン修正が必要な場合は revised_plan も返し、ユーザーに「プランを更新する」ボタンを表示  
6. ユーザーが更新を承認するとプランカードが再描画される  

**代替フロー**:  
- A1: 相談が最大10ターンに達した場合 → 入力欄を無効化しメッセージ表示  
- A2: APIエラー → エラーメッセージ表示、再送信可能  

---

## Step 3: API仕様

### POST /plan/consult

**認証**: Cognito JWT 必須  

#### リクエスト

```json
{
  "session_id": "uuid",
  "incident_summary": "string",
  "opponent_type": "string",
  "opponent_anger_level": 60,
  "current_plan_summary": "string（first_words + timing を要約、300字以内）",
  "conversation_history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "user_message": "string（1000字以内）"
}
```

#### レスポンス

```json
{
  "advice": "string",
  "revised_plan": null
}
```

または

```json
{
  "advice": "タイミングを変えることをお勧めします。...",
  "revised_plan": {
    "timing": "明日の午前中、メールで事前アポを取ってから直接会う形が望ましいです"
  }
}
```

---

## Step 4: バックエンド設計

### consult-plan Lambda

| 項目 | 内容 |
|------|------|
| 関数名 | consult-plan |
| ランタイム | Python 3.13 |
| メモリ | 256MB |
| タイムアウト | 30s |
| モデル | standard（Claude Haiku 4.5） |
| 同期/非同期 | **同期**（SQS不使用） |

**入力バリデーション（_SCHEMA）**:

| フィールド | 型 | 必須 | 最大長 |
|-----------|:--:|:----:|--------|
| session_id | str | - | 36 |
| incident_summary | str | ✓ | 2000 |
| opponent_type | str | - | 100 |
| opponent_anger_level | int | - | - |
| current_plan_summary | str | - | 300 |
| conversation_history | list | - | (max 10要素) |
| user_message | str | ✓ | 1000 |

---

## Step 5: フロントエンド設計

### UIコンポーネント

```
[step-plan] セクション内
  └─ .plan-card（既存）
  └─ #consult-panel（新規・折りたたみ）
       ├─ .consult-chat-area
       │    └─ .consult-bubble（role: user/assistant）
       ├─ .consult-input-row
       │    ├─ <textarea id="consult-input">
       │    └─ <button id="btn-consult-send">
       └─ #consult-revised-plan（revised_planがある場合に「プランを更新する」ボタン表示）
```

### 状態変数

```javascript
let _consultHistory = [];  // { role, content }[]
const MAX_CONSULT_TURNS = 10;
```

### セキュリティ

- textContent のみ使用（XSS-01）
- 入力は1000文字以内バリデーション（フロント＋バック両方）
- 会話履歴はメモリのみ（ページリロードでリセット）

---

## Step 6: ユーザーストーリー対応

既存ストーリーにない機能のため、U2-EXT として新規定義。  
**US-EXT-01**: ユーザーとして、プラン生成後に現在の状況を入力すると、AIが状況に応じた対処法を提案してほしい。  
**US-EXT-02**: ユーザーとして、AIの提案に基づいてプランの一部を更新したい。

---
