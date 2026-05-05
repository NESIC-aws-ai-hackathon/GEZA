# U0 ビジネスロジックモデル

> AI-DLC CONSTRUCTION Phase — Functional Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## 概要

U0 のビジネスロジックは「全ユニットが共通利用する横断的処理」に特化する。  
個別ドメインロジック（謝罪評価・感情分析等）は各ユニット（U1〜U9）が担当する。

### U0 が担うコアロジック領域

| 領域 | モジュール | 主責務 |
|------|---------|------|
| リクエスト処理共通基盤 | `shared/decorators.py` | エラーハンドリング・レスポンス整形 |
| 入力バリデーション | `shared/input_validator.py` | セキュリティ境界での全入力検証 |
| Bedrock 呼び出し | `shared/bedrock_client.py` | LLM API 抽象化・リトライ |
| プロンプト管理 | `shared/prompt_loader.py` | テンプレート読み込み・変数展開 |
| 認証状態管理 | `frontend/shared/auth.js` | Cognito JWT ライフサイクル管理 |
| API 通信 | `frontend/shared/api.js` | HTTP リクエスト統一化 |
| アプリ状態管理 | `frontend/shared/state.js` | 3層ステート管理 |
| アバター制御 | `frontend/shared/avatar.js` | SVG感情表現・アニメーション制御 |
| 感情定義 | `frontend/shared/emotions.js` | 200感情/15カテゴリ管理・ランダム遷移 |

---

## 1. Lambda リクエスト処理フロー（全 Lambda 共通）

```
HTTP POST → API Gateway → Cognito JWT Authorizer
                                │
                         JWT 有効 ✓
                                │
                      Lambda ハンドラー
                                │
            ┌───────────────────┼────────────────────┐
            │                   │                    │
     @handle_errors      input_validator       prompt_loader
     デコレーター           .validate()          .load()
            │                   │                    │
       try/except         スキーマ検証         テンプレート取得
       統一エラー形式       インジェクション       変数展開
                          文字数チェック
                                │
                         bedrock_client
                              .call()
                                │
                    ┌───────────┴──────────┐
                    │                      │
               成功レスポンス          ThrottlingException
               JSON 返却             ServiceUnavailable
                                          │
                                   指数バックオフ
                                   リトライ（最大3回）
                                    1s → 2s → 4s
                                          │
                                    最終失敗時
                                   503 エラー返却
```

---

## 2. `decorators.py` — @handle_errors デコレーター

### 責務
- 全 Lambda ハンドラーを `try/except` でラップし、統一エラーレスポンスを返す
- スタックトレース・内部パス・フレームワーク情報を本番レスポンスに含めない（SECURITY-09）
- 構造化ログ（CloudWatch Logs）への出力

### ロジックフロー

```python
def handle_errors(func):
    def wrapper(event, context):
        request_id = context.aws_request_id
        logger = get_structured_logger(request_id)  # SECURITY-03

        try:
            logger.info("Lambda invoked", extra={"function": func.__name__})
            result = func(event, context)
            logger.info("Lambda succeeded")
            return result

        except ValidationError as e:
            logger.warning("Validation failed", extra={"error_type": "ValidationError"})
            return error_response(400, "入力内容を確認してください", request_id)

        except BedrockThrottleError as e:
            logger.error("Bedrock throttled after retries")
            return error_response(503, "一時的に混雑しています。しばらくしてから再試行してください", request_id)

        except Exception as e:
            logger.error("Unexpected error", extra={"error_type": type(e).__name__})
            # スタックトレースは本番レスポンスに含めない（SECURITY-09）
            return error_response(500, "サーバーエラーが発生しました", request_id)

    return wrapper
```

### 統一レスポンス形式

```json
// 成功
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "<CFN_ORIGIN>",  // ワイルドカード禁止（SECURITY-08）
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  },
  "body": "{...}"
}

// エラー
{
  "statusCode": 400,
  "headers": { "Content-Type": "application/json; charset=utf-8" },
  "body": "{\"error\": \"入力内容を確認してください\", \"request_id\": \"<id>\"}"
}
```

---

## 3. `input_validator.py` — 入力バリデーション

### 責務（Q1: B + Q8: C）
1. **必須フィールド検証** — required フィールドの存在確認
2. **型検証** — 期待する型と一致しているか
3. **文字列長制限** — デフォルト上限 2,000 文字
4. **プロンプトインジェクション検知** — ブロックリスト + HTMLエスケープ（Q8: C）

### バリデーションフロー

```
validate(body, schema)
    │
    ├─ JSON パース済みか確認
    │
    ├─ required フィールド存在確認
    │   └─ 欠如 → ValidationError("フィールド '{name}' は必須です")
    │
    ├─ 型チェック（str / int / list / dict）
    │   └─ 不一致 → ValidationError("'{name}' の型が不正です")
    │
    ├─ 文字列長チェック（str フィールド）
    │   └─ > 2,000文字 → ValidationError("'{name}' は2000文字以内で入力してください")
    │
    ├─ プロンプトインジェクション検知（INJECTION_PATTERNS に一致）
    │   └─ 検知 → ValidationError("不正な入力が含まれています")
    │
    └─ HTMLエスケープ（str フィールドすべて）
        └─ 返却値: サニタイズ済み dict
```

### プロンプトインジェクション検知パターン（INJECTION_PATTERNS）

```python
INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|above|prior)\s+instructions?",
    r"system\s*:",
    r"<\s*/?system\s*>",
    r"you\s+are\s+now",
    r"forget\s+(everything|all)",
    r"new\s+instructions?\s*:",
    r"act\s+as\s+(if\s+you\s+are|a)",
    r"jailbreak",
    r"DAN\s+mode",
    r"pretend\s+you",
]
```

---

## 4. `bedrock_client.py` — Bedrock 呼び出し

### 責務
- AWS Bedrock `converse` API の統一ラッパー
- 指数バックオフリトライ（Q2: B）
- LLMプロファイル（fast/standard/premium）のモデルID解決

### リトライロジック

```
call(model_profile, messages, system_prompt, max_tokens)
    │
    ├─ モデルID解決
    │   fast     → amazon.nova-lite-v1:0
    │   standard → anthropic.claude-haiku-4-5-v1:0
    │   premium  → anthropic.claude-sonnet-4-5-v1:0
    │
    ├─ 試行 1回目
    │   ├─ 成功 → レスポンス返却
    │   └─ ThrottlingException / ServiceUnavailableException
    │       └─ wait 1s → 試行 2回目
    │           ├─ 成功 → レスポンス返却
    │           └─ 失敗
    │               └─ wait 2s → 試行 3回目
    │                   ├─ 成功 → レスポンス返却
    │                   └─ 失敗 → BedrockThrottleError 送出
    │
    └─ その他例外（AccessDeniedException 等）→ 即時送出（リトライなし）
```

---

## 5. `prompt_loader.py` — プロンプトテンプレート管理

### 責務
- `backend/prompts/{name}.txt` から Mustache 風テンプレートを読み込む
- `{{variable_name}}` 形式の変数を展開して完成プロンプトを返す
- テンプレートが存在しない場合は `PromptNotFoundError` を送出

### テンプレート変数展開フロー

```
load(name, variables)
    │
    ├─ ファイルパス解決: /opt/prompts/{name}.txt（Lambda Layer）
    │   └─ ファイルなし → PromptNotFoundError("{name}.txt が見つかりません")
    │
    ├─ ファイル読み込み（UTF-8）
    │
    ├─ 変数展開（re.sub による {{key}} → value 置換）
    │   └─ 未定義変数が残存 → PromptRenderError("変数 '{key}' が未定義です")
    │
    └─ 展開済みプロンプト文字列を返す
```

---

## 6. EmotionDefinitions — カテゴリ内ランダム遷移ロジック（emotions.js）

### 責務
- 200感情・15カテゴリの定義を管理するシングルトン
- **カテゴリ内重み付きランダム選択**（先頭3感情は出現確率2倍）
- **連続同一感情の回避**（直前IDを除外してランダム選択）

### PBT対象プロパティ（PBT-01 / Q9: A）

| プロパティ種別 | 内容 | カテゴリ |
|------------|------|--------|
| Invariant | `pickRandomInCategory(cat, prev)` は常にカテゴリ内の感情IDを返す | Invariant |
| Invariant | 戻り値が `prev` と等しくなることはない（カテゴリ内感情が2以上の場合） | Invariant |
| Invariant | `getEmotionsByCategory(cat)` の戻り値配列サイズはカテゴリ定義と一致 | Invariant |

### ランダム選択アルゴリズム

```
pickRandomInCategory(categoryId, prevEmotionId)
    │
    ├─ getEmotionsByCategory(categoryId) で候補リスト取得
    │
    ├─ 候補から prevEmotionId を除外
    │
    ├─ 重み計算（先頭3感情 = weight 2、その他 = weight 1）
    │
    └─ 重み付き確率で1件ランダム選択 → 感情IDを返す
```

---

## 7. テスタブルプロパティ一覧（PBT-01 準拠）

| 対象コンポーネント | プロパティ種別 | 説明 |
|-----------------|------------|------|
| `pickRandomInCategory()` | Invariant | 戻り値は常に指定カテゴリ内の感情ID |
| `pickRandomInCategory()` | Invariant | 戻り値は prev と異なる（カテゴリ内2感情以上の場合） |
| `input_validator.validate()` | Invariant | 有効スキーマ準拠入力は常に通過する |
| `input_validator.validate()` | Invariant | インジェクションパターン入力は常に ValidationError |
| `input_validator.validate()` | Invariant | 2001文字以上の文字列フィールドは常に ValidationError |
| `StateManager` 3層読み書き | Round-trip | 書き込み→読み込みで同値（sessionStorage） |
| `AvatarController.exportConfig()` → `init()` | Round-trip | N/A（Q9でB, D未選択のため対象外） |
