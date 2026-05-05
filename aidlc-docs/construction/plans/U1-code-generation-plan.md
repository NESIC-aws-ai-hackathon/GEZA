# U1 コード生成プラン
> AI-DLC CONSTRUCTION Phase — Code Generation Plan  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）  
> ステータス: 承認待ち

---

## 実装ストーリー

| ストーリーID | タイトル | SP |
|------------|---------|:--:|
| US-TOP-001 | ランダムアバター表示（facesjs）| 5 |
| US-TOP-002 | ログイン画面（メール+パスワード）| 8 |
| US-TOP-003 | TOTP MFA フロー | 5 |
| US-TOP-004 | ログイン成功 → TOPセクション表示 | 3 |
| US-TOP-005 | アバター拡大トランジション（W-2）| 3 |
| US-TOP-006 | サイレントリフレッシュ（ページロード時自動ログイン）| 5 |
| US-TOP-007 | 3ゲージ表示（怒り度/信頼度/難易度）| 3 |
| US-TOP-008 | モードボタン表示（available/coming-soon）| 3 |
| US-TOP-009 | ログアウト | 3 |

---

## 依存ファイル（U0 実装済み・変更なし）

- `frontend/shared/state.js` — StateManager
- `frontend/shared/avatar.js` — AvatarController
- `frontend/shared/anger-gauge.js` — AngerGauge
- `frontend/shared/api.js` — ApiModule

---

## 生成ステップ

### Step 1: `frontend/config.js` 新規作成 [x]

**目的**: window.GEZA_CONFIG を定義（U0 参照済みだが未生成）  
**内容**:
- userPoolId / clientId / region
- apiBaseUrl（API GW エンドポイント）
- Cognito ホスト型 UI は不使用（REST API 直接呼び出し方式のため loginUrl 等は不要）

### Step 2: `frontend/assets/facesjs.min.js` 配置 [x]

**目的**: facesjs ライブラリを frontend/ に配置  
**方法**: `prototype/frontend/facesjs.min.js` → `frontend/assets/facesjs.min.js` にコピー（create_file で内容転写）  
**注意**: ファイルサイズが大きい場合は read_file で先頭・末尾を確認

### Step 3: `frontend/shared/auth.js` 更新 [x]

**目的**: Cognito REST API 直接呼び出し（USER_PASSWORD_AUTH + REFRESH_TOKEN）に完全移行  
**変更内容**:
- `sessionStorage` → `localStorage`（`geza_refresh_token` のみ）、idToken/accessToken はモジュール変数メモリ
- `login(email, password)` 追加: `initiateAuth(USER_PASSWORD_AUTH)` 呼び出し。チャレンジ判定
- `submitMFA(totpCode, cognitoSession)` 追加: `respondToAuthChallenge(SOFTWARE_TOKEN_MFA)`
- `silentRefresh()` 追加: `initiateAuth(REFRESH_TOKEN_AUTH)` でページロード時自動リフレッシュ
- `requireAuth()` 追加: localStorage に refreshToken がなければ index.html にリダイレクト
- `getAccessToken()` 更新: tokenExpiry < 5分なら silentRefresh() を先に呼ぶ
- `logout()` 更新: globalSignOut + localStorage 削除
- 旧 `redirectToLogin()` / `handleCallback()` / `redirectToLogin()` は削除（ホスト型UI不使用）

### Step 4: `frontend/style.css` 新規作成 [x]

**目的**: 全ページ共通スタイル + ログイン画面 + TOP画面 + アバタートランジション  
**内容**:
- リセット / ボディ（ダークテーマ、max-width: 430px 中央）
- `.avatar-container` + `.small`（80px）/ `.large`（200px） + transition 0.5s ease
- `#login-section` / `#mfa-form` / `#top-section` のレイアウト
- `.btn` / `.btn-primary` / `.btn-secondary`
- `.mode-btn` / `.mode-btn[data-status="coming-soon"]`（グレーアウト + .coming-soon-badge）
- ゲージコンテナスタイル（AngerGauge 用 `.gauge-bar` は anger-gauge.js が描画）
- エラーメッセージ `.error-message`
- ローディングスピナー `.loading-spinner`

### Step 5: `frontend/pages/top.js` 新規作成 [x]

**目的**: TopPageController（初期化・認証フロー・アバター・ゲージ・モード選択）  
**内容**:
- `init()`: DOMContentLoaded で呼び出し。アバター初期化 + 認証状態チェックを並行実行
- `_generateBossAvatar()`: `crypto.getRandomValues()` シード → `faces.generate()` → SVG 描画 → `.small` 付与
- `_checkAuthState()`: `AuthModule.silentRefresh()` → 成功でTOP表示、失敗でログイン表示
- `showSection(id)`: `.page-section` 全非表示 → 指定 section 表示
- `_setupLoginForm()`: email / password バリデーション → `AuthModule.login()`
- `_setupMFAForm()`: TOTP 6桁バリデーション → `AuthModule.submitMFA()`
- `_onLoginSuccess()`: `.small → .large` トランジション + `AvatarController.startAnimation()` + TOP表示
- `_setupGauges()`: `AngerGauge.init()` + 信頼度・難易度ゲージ描画
- `_setupModeSelector()`: `.mode-btn[data-status=available]` にイベントリスナー
- `_handleLogout()`: `AuthModule.logout()` → ログイン表示
- エラー表示: `element.textContent = message`（XSS-01 準拠）

### Step 6: `frontend/index.html` 更新 [x]

**目的**: 1ページ構成（#login-section + #mfa-form + #top-section）に再構築  
**変更内容**:
- `<script src="config.js">` / `<script src="assets/facesjs.min.js">` / `<link rel="stylesheet" href="style.css">` を保持
- `<body>` を `#login-section` / `#top-section` の2セクション構成に変更
- `#login-section`: アバターコンテナ(.small) + ログインフォーム + MFAフォーム(hidden)
- `#top-section`: ヘッダー + アバターコンテナ(.large) + 3ゲージ + 4モードボタン（全 coming-soon）
- `data-testid` 属性を全インタラクティブ要素に付与
- `<script src="shared/auth.js">` / `<script src="shared/state.js">` / `<script src="shared/avatar.js">` / `<script src="shared/anger-gauge.js">` / `<script src="pages/top.js">` のロード

### Step 7: `aidlc-docs/construction/U1/code/change-log.md` 作成 [x]

**目的**: コード変更ログの記録

---

## 変更ファイルサマリー

| ファイル | 操作 |
|--------|:---:|
| `frontend/config.js` | 新規 |
| `frontend/assets/facesjs.min.js` | 新規（prototype からコピー） |
| `frontend/shared/auth.js` | 更新 |
| `frontend/style.css` | 新規 |
| `frontend/pages/top.js` | 新規 |
| `frontend/index.html` | 更新 |
| `aidlc-docs/construction/U1/code/change-log.md` | 新規 |

---

## 技術制約

- facesjs の呼び出し: `window.faces.generate()` / `window.faces.display()` / `window.faces.override()`
- TOTP 入力: `type="text" inputmode="numeric"` （type="number" 禁止 — 先頭ゼロが消える）
- DOM 挿入: 全ユーザー入力は `textContent` のみ（innerHTML 禁止）
- facesjs SVG 挿入のみ `innerHTML` 例外（XSS-01 例外として承認済み）
- `crypto.getRandomValues()` を使用（Date.now() 禁止）
