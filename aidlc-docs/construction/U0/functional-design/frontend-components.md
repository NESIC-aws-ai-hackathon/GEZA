# U0 フロントエンドコンポーネント設計

> AI-DLC CONSTRUCTION Phase — Functional Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## コンポーネント一覧

| ファイル | クラス/モジュール | 主責務 |
|---------|---------------|------|
| `frontend/shared/auth.js` | `AuthModule` | Cognito JWT ライフサイクル管理 |
| `frontend/shared/api.js` | `ApiClient` | 認証付き HTTP 通信・自動リフレッシュ |
| `frontend/shared/state.js` | `StateManager` | AppState / SessionState 3層管理 |
| `frontend/shared/avatar.js` | `AvatarController` | facesjs SVG 感情表現・アニメーション |
| `frontend/shared/emotions.js` | `EmotionDefinitions` | 200感情/15カテゴリ定義・ランダム遷移 |

---

## 1. `auth.js` — AuthModule

### 責務
Cognito User Pool / Identity Pool の認証状態を一元管理する。  
ページ遷移をまたいで JWT トークンを sessionStorage に保管し、有効性を監視する。

### 公開 API

```javascript
class AuthModule {
  /**
   * 初期化。DOMContentLoaded で呼び出す。
   * 未認証の場合はログインページへリダイレクト。
   * @returns {Promise<void>}
   */
  async init();

  /**
   * メールアドレス + パスワードでサインイン。
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{idToken: string, accessToken: string, refreshToken: string}>}
   */
  async signIn(email, password);

  /**
   * サインアウト。sessionStorage クリア後ログインへリダイレクト。
   * @returns {void}
   */
  signOut();

  /**
   * 現在の IdToken を返す（必要に応じてリフレッシュ）。
   * @returns {Promise<string>}
   */
  async getIdToken();

  /**
   * Cognito refreshToken で IdToken / AccessToken を更新。
   * @returns {Promise<void>}
   * @throws {AuthRefreshError} refreshToken 期限切れ
   */
  async refreshTokens();

  /**
   * 現在のユーザー情報（sub / email）を返す。
   * @returns {{ userId: string, email: string } | null}
   */
  getCurrentUser();
}
```

### 状態フロー

```
init()
  │
  ├─ sessionStorage に idToken あり
  │   └─ トークン有効期限確認
  │       ├─ 有効 → 認証済み状態で完了
  │       └─ 期限切れ → refreshTokens()
  │           ├─ 成功 → 認証済み状態で完了
  │           └─ 失敗 → ログインページへリダイレクト
  │
  └─ sessionStorage に idToken なし
      └─ ログインページへリダイレクト（現在URL を redirectTo に付与）
```

### セキュリティ適用
- AUTH-05: IdToken / AccessToken は `sessionStorage` のみ（`localStorage` 禁止）
- COGNITO-04: トークン有効期限を JWT の `exp` クレームで確認

---

## 2. `api.js` — ApiClient

### 責務
全 API エンドポイントへの HTTP 通信を統一化する。  
Authorization ヘッダー付与と 401 時の自動リフレッシュを担う（Q5: A）。

### 公開 API

```javascript
class ApiClient {
  constructor(baseUrl, authModule);

  /**
   * POST リクエストを送信する。
   * 401 の場合はトークンリフレッシュ後に1回リトライする（AUTH-01〜04）。
   * @param {string} endpoint  例: "/generate-opponent"
   * @param {object} body
   * @returns {Promise<object>} レスポンス JSON
   * @throws {ApiError} 400, 422, 429, 500, 503
   * @throws {AuthRefreshError} refreshToken 期限切れ → ログインへリダイレクト
   */
  async post(endpoint, body);

  /**
   * GET リクエストを送信する（認証付き）。
   * @param {string} endpoint  例: "/session-history?limit=10"
   * @returns {Promise<object>} レスポンス JSON
   */
  async get(endpoint);
}
```

### 自動リフレッシュシーケンス（Q5: A / AUTH-01〜04）

```
post(endpoint, body)
  │
  ├─ 1回目リクエスト（Authorization: Bearer <idToken>）
  │   ├─ 2xx → レスポンス返却
  │   ├─ 401 → refreshQueue を確認
  │   │   ├─ リフレッシュ中でない → authModule.refreshTokens() を起動
  │   │   │   ├─ 成功 → 待機中リクエストを全てリトライ（AUTH-04）
  │   │   │   └─ 失敗 → AuthRefreshError → ログインページへ
  │   │   └─ リフレッシュ中 → キューに積んで待機（AUTH-04）
  │   └─ 4xx / 5xx → ApiError 送出（ERR-05のコードで）
  └─ 2回目リクエスト（新 idToken）
      ├─ 2xx → レスポンス返却
      └─ 401 → AuthRefreshError（二重リフレッシュ禁止）
```

### エラーハンドリング

```javascript
class ApiError extends Error {
  constructor(statusCode, message, requestId) {
    this.statusCode = statusCode;
    this.message = message;    // バックエンドからの日本語メッセージ
    this.requestId = requestId;
  }
}
```

---

## 3. `state.js` — StateManager

### 責務
AppState（メモリ）/ SessionState（sessionStorage）/ DynamoDB（バックエンド経由）の  
3層ステートを統一 API で管理する（Q3: A）。

### 公開 API

```javascript
class StateManager {
  /**
   * AppState に値を設定する（メモリのみ、即時反映）。
   * @param {keyof AppState} key
   * @param {*} value
   */
  setAppState(key, value);

  /**
   * AppState の値を取得する。
   * @param {keyof AppState} key
   * @returns {*}
   */
  getAppState(key);

  /**
   * SessionState をシリアライズして sessionStorage に保存する。
   * @param {Partial<SessionState>} updates
   */
  setSessionState(updates);

  /**
   * sessionStorage から SessionState を取得する。
   * @returns {SessionState | null}
   */
  getSessionState();

  /**
   * SessionState の特定フィールドを取得する。
   * @param {keyof SessionState} key
   * @returns {*}
   */
  getSessionField(key);

  /**
   * AppState を初期値にリセットする（新セッション開始時）。
   */
  resetAppState();

  /**
   * セッション終了時に sessionStorage をクリアする。
   */
  clearSessionState();
}
```

### 3層ステート対応表

| データ | 保管場所 | ライフタイム | アクセス方法 |
|-------|---------|-----------|------------|
| `currentTurn`, `angerLevel`, `lastEmotion` | `window.AppState` | ページ内のみ | `setAppState / getAppState` |
| `sessionId`, `bossProfile`, `planData` | `sessionStorage` | タブを閉じるまで | `setSessionState / getSessionState` |
| 会話履歴（11ターン以降）、カルテ | DynamoDB | 永続 | `ApiClient.get("/session-history")` |

---

## 4. `avatar.js` — AvatarController

### 責務
facesjs を使用して SVG アバターを描画し、感情カテゴリに応じたアニメーションを制御する。  
カテゴリ内タイマーを内部管理し、自動遷移を行う（Q4: A）。

### 公開 API

```javascript
class AvatarController {
  /**
   * アバター初期化。facesjs で SVG を生成・DOMに挿入。
   * @param {HTMLElement} container  SVG 挿入先要素
   * @param {number} seed            facesjs seed 値
   */
  init(container, seed);

  /**
   * カテゴリ内ランダム感情を設定してアニメーション開始。
   * 前のカテゴリタイマーをクリアして新しいタイマーを起動する（Q4: A）。
   * @param {string} categoryId  感情カテゴリID
   * @param {object} [options]
   * @param {number} [options.autoTransitionMs=3000]  自動遷移間隔（ms）
   * @param {boolean} [options.loop=true]             ループするか
   */
  setCategoryEmotion(categoryId, options);

  /**
   * 特定の感情 ID を指定して一度だけ表示。
   * @param {string} emotionId
   */
  setEmotion(emotionId);

  /**
   * 現在のタイマーを停止してアバターを中立状態に戻す。
   */
  stopAnimation();

  /**
   * アバター設定（seed 等）を JSON でエクスポートする。
   * @returns {object}
   */
  exportConfig();
}
```

### タイマー管理ロジック（Q4: A）

```
setCategoryEmotion(categoryId, options)
  │
  ├─ 前のタイマー（this._autoTimer）が存在すれば clearInterval でクリア
  │
  ├─ EmotionDefinitions.pickRandomInCategory(categoryId, this._prevEmotionId)
  │   └─ 感情ID取得
  │
  ├─ setEmotion(emotionId) → CSS アニメーション適用
  │
  ├─ this._prevEmotionId = emotionId（直前ID更新）
  │
  └─ options.loop が true かつ autoTransitionMs > 0 の場合:
      └─ setInterval で autoTransitionMs 毎に以下を繰り返す:
          ├─ pickRandomInCategory(categoryId, this._prevEmotionId)
          ├─ setEmotion(newEmotionId)
          └─ this._prevEmotionId = newEmotionId
```

### 感情 → CSS アニメーション変換

```javascript
// CSS Custom Properties を :root に設定してアニメーション制御
function applyEmotionCSS(emotionCss, motionType, effect) {
  const root = document.documentElement;
  root.style.setProperty('--eyebrow-scale', emotionCss.eyebrowScale);
  root.style.setProperty('--eyebrow-y', `${emotionCss.eyebrowY}px`);
  root.style.setProperty('--eye-scale', emotionCss.eyeScale);
  root.style.setProperty('--eye-openness', emotionCss.eyeOpenness);
  root.style.setProperty('--mouth-openness', emotionCss.mouthOpenness);
  root.style.setProperty('--mouth-curve', emotionCss.mouthCurve);
  root.style.setProperty('--head-tilt', `${emotionCss.headTilt}deg`);
  root.style.setProperty('--body-forward', emotionCss.bodyForward);

  // モーションクラス付与（排他）
  avatarEl.className = '';
  avatarEl.classList.add(`motion-${motionType}`);
  if (effect) avatarEl.classList.add(`effect-${effect}`);
}
```

---

## 5. `emotions.js` — EmotionDefinitions

### 責務
200感情・15カテゴリの定義を管理するシングルトン。  
カテゴリ内重み付きランダム選択と連続同一感情回避を提供する（PBT-01 / Q9: A）。

### 公開 API

```javascript
const EmotionDefinitions = {
  /**
   * カテゴリ内で重み付きランダムに1感情を選ぶ。
   * prev と同じ感情は返さない（カテゴリ内感情が2以上の場合）。
   *
   * [PBT-01 Invariant]
   *   forAll(cat, prev):
   *     result = pickRandomInCategory(cat, prev)
   *     assert result in getEmotionsByCategory(cat)
   *     assert result !== prev (if |emotions| >= 2)
   *
   * @param {string} categoryId
   * @param {string | null} prevEmotionId
   * @returns {string} 感情ID
   */
  pickRandomInCategory(categoryId, prevEmotionId),

  /**
   * カテゴリ内の全感情リストを返す。
   * @param {string} categoryId
   * @returns {Emotion[]}
   */
  getEmotionsByCategory(categoryId),

  /**
   * 感情ID から感情オブジェクトを返す。
   * @param {string} emotionId
   * @returns {Emotion | undefined}
   */
  getById(emotionId),

  /**
   * 全カテゴリリストを返す。
   * @returns {EmotionCategory[]}
   */
  getAllCategories(),
};
```

### カテゴリ定義一覧（15カテゴリ）

| カテゴリID | 日本語名 | 感情数 |
|-----------|--------|------|
| `fierce_anger` | 激怒・爆発 | 14 |
| `cold_anger` | 冷静な怒り・軽蔑 | 14 |
| `deep_sadness` | 悲しみ・喪失 | 14 |
| `anxiety_worry` | 不安・心配 | 14 |
| `shame_guilt` | 恥・罪悪感 | 13 |
| `surprise_shock` | 驚き・動揺 | 13 |
| `confusion_loss` | 混乱・途方に暮れ | 13 |
| `joy_relief` | 喜び・安心 | 14 |
| `cautious_observe` | 慎重・様子見 | 13 |
| `resignation_acceptance` | 諦め・受容 | 13 |
| `compassion_forgiveness` | 思いやり・許し | 13 |
| `thinking_pondering` | 思考・考え込み | 13 |
| `stiff_defense` | 硬直・防衛 | 14 |
| `awkward_embarrassed` | ぎこちなさ・照れ | 13 |
| `neutral_waiting` | 中立・待機 | 13 |

**合計: 200感情 / 15カテゴリ** ✅

### 重み付きランダム選択アルゴリズム

```javascript
pickRandomInCategory(categoryId, prevEmotionId) {
  const emotions = this.getEmotionsByCategory(categoryId);

  // prev を除外
  const candidates = emotions.filter(e => e.id !== prevEmotionId);

  // 重み計算（先頭3感情 weight=2、その他 weight=1）
  const originalIndexes = emotions.map((e, i) => i);
  const weights = candidates.map(e => {
    const origIdx = emotions.indexOf(e);
    return origIdx < 3 ? 2 : 1;
  });

  // 重み付き選択
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i].id;
  }
  return candidates[candidates.length - 1].id;
}
```

---

## 6. PBT テストケース仕様（Q9: A, C）

### 6.1 EmotionDefinitions.pickRandomInCategory() のテスト仕様

```javascript
// PBT フレームワーク: fast-check（JavaScript）
import fc from 'fast-check';

describe('EmotionDefinitions.pickRandomInCategory - PBT', () => {
  test('Invariant: 戻り値は常に指定カテゴリ内の感情ID', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EmotionDefinitions.getAllCategories().map(c => c.id)),
        fc.option(fc.string(), { nil: null }),
        (categoryId, prevId) => {
          const result = EmotionDefinitions.pickRandomInCategory(categoryId, prevId);
          const validIds = EmotionDefinitions.getEmotionsByCategory(categoryId).map(e => e.id);
          return validIds.includes(result);
        }
      )
    );
  });

  test('Invariant: 戻り値は prev と異なる（カテゴリ内感情が2以上の場合）', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EmotionDefinitions.getAllCategories()
          .filter(c => c.emotions.length >= 2)
          .map(c => c.id)),
        fc.string(),
        (categoryId, prevId) => {
          // prevId が実際の感情IDの場合のみ不等条件を確認
          const validIds = EmotionDefinitions.getEmotionsByCategory(categoryId).map(e => e.id);
          if (!validIds.includes(prevId)) return true; // prev が範囲外ならスキップ
          const result = EmotionDefinitions.pickRandomInCategory(categoryId, prevId);
          return result !== prevId;
        }
      )
    );
  });
});
```

### 6.2 input_validator.validate() のテスト仕様

```python
# PBT フレームワーク: Hypothesis（Python）
from hypothesis import given, strategies as st
from hypothesis import settings
from shared.input_validator import validate, ValidationError

SIMPLE_SCHEMA = {
    "text": {"type": str, "required": True, "max_length": 2000}
}

@given(text=st.text(max_size=2000).filter(lambda t: not _has_injection(t)))
def test_valid_input_always_passes(text):
    """Invariant: 有効な入力は常にバリデーションを通過する"""
    body = {"text": text}
    result = validate(body, SIMPLE_SCHEMA)
    assert "text" in result  # エラーなしで返却される

@given(text=st.from_regex(
    r"(?i)(ignore\s+previous\s+instructions?|system\s*:|jailbreak)", fullmatch=True
))
def test_injection_always_rejected(text):
    """Invariant: インジェクションパターンは常に ValidationError"""
    body = {"text": text}
    with pytest.raises(ValidationError):
        validate(body, SIMPLE_SCHEMA)

@given(text=st.text(min_size=2001, max_size=5000))
def test_too_long_always_rejected(text):
    """Invariant: 2001文字以上は常に ValidationError"""
    body = {"text": text}
    with pytest.raises(ValidationError):
        validate(body, SIMPLE_SCHEMA)
```

---

## 7. コンポーネント依存関係図

```
AuthModule
    │
    └──> (IdToken) ──> ApiClient
                           │
                           ├── StateManager (sessionState.sessionId 参照)
                           │
                           └── (APIレスポンス) ──> StateManager (setSessionState)
                                                         │
                                                         └── AvatarController (emotion更新)
                                                                   │
                                                                   └── EmotionDefinitions
                                                                       (pickRandomInCategory)
```
