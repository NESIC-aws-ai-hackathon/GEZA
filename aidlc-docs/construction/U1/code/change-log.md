# U1 コード変更ログ
> AI-DLC CONSTRUCTION Phase — Code Generation  
> 対象ユニット: U1（トップ画面 + Cognito認証）  
> 生成日: 2026-05-05

---

## 変更サマリー

| ファイル | 操作 | ステップ |
|--------|:---:|:------:|
| `frontend/config.js` | **新規** | Step 1 |
| `frontend/assets/facesjs.min.js` | **新規** | Step 2 |
| `frontend/shared/auth.js` | **更新** | Step 3 |
| `frontend/style.css` | **新規** | Step 4 |
| `frontend/pages/top.js` | **新規** | Step 5 |
| `frontend/index.html` | **更新** | Step 6 |

---

## 詳細変更内容

### frontend/config.js（新規）
- `window.GEZA_CONFIG` を定義
- Cognito（userPoolId / clientId / region）、API Gateway（apiBaseUrl）、CloudFront（cloudfrontDomain）を設定

### frontend/assets/facesjs.min.js（新規）
- `prototype/frontend/facesjs.min.js`（338KB）をコピー
- `window.faces.generate() / display() / override()` を提供

### frontend/shared/auth.js（更新）
- **削除**: `redirectToLogin()` / `handleCallback()` / sessionStorage 依存コード
- **追加**: `login(email, password)` — USER_PASSWORD_AUTH フロー
- **追加**: `submitMFA(totpCode, cognitoSession)` — SOFTWARE_TOKEN_MFA チャレンジ応答
- **追加**: `silentRefresh()` — REFRESH_TOKEN_AUTH によるページロード時自動リフレッシュ
- **追加**: `getValidAccessToken()` — 有効期限チェック + 自動リフレッシュ
- **追加**: `requireAuth()` — 未認証時は index.html へリダイレクト
- **変更**: refreshToken → `localStorage['geza_refresh_token']`（30日維持）
- **変更**: idToken / accessToken → モジュール内変数のみ（XSS-01 / AUTH-05 準拠）

### frontend/style.css（新規）
- ダークテーマ（背景 #1a1a2e / #16213e）
- `.avatar-container` + `.small`（80px）/ `.large`（200px）トランジション 0.5s ease
- ログインカード / フォーム / MFA フォーム スタイル
- TOPセクション（ヘッダー / アバター / ゲージ / モードボタン）
- モードボタン `[data-status="coming-soon"]` グレーアウト
- グローバルエラーバナー

### frontend/pages/top.js（新規）
- IIFE パターン（グローバル汚染なし）
- `_initAvatar()`: `crypto.getRandomValues()` シード → `faces.generate()` → `.small/.large` 両コンテナに描画
- `_checkAuthState()`: `silentRefresh()` → 成功で TOP 表示 / 失敗でログイン表示
- `_setupLoginForm()`: email / password バリデーション + `AuthModule.login()`
- `_setupMFAForm()`: TOTP 6桁チェック + `AuthModule.submitMFA()`
- `_onLoginSuccess()`: `.small → .large` CSS トランジション（0.5s）
- `_setupGauges()`: AngerGauge.init/update + シンプルバーゲージ（信頼度・難易度）
- `_setupModeSelector()`: coming-soon ボタンは無効化
- `_cognitoErrorMessage()`: エラーコード → ユーザーフレンドリーメッセージ変換
- 全 DOM 挿入: `textContent` 使用（XSS-01 準拠）

### frontend/index.html（更新）
- 1ページ構成: `#login-section` + `#top-section`（`.page-section[hidden]` で切り替え）
- `#login-section`: アバターコンテナ（.small）+ ログインフォーム + MFA フォーム（hidden）
- `#top-section`: ヘッダー + アバターコンテナ（.large）+ 3ゲージ + 4モードボタン（全 coming-soon）
- 全インタラクティブ要素に `data-testid` 属性付与
- スクリプト読み込み順: config.js → facesjs.min.js → state.js → auth.js → avatar.js → anger-gauge.js → top.js

---

## セキュリティチェック

| 項目 | 状態 |
|-----|:---:|
| XSS-01: ユーザー入力の textContent 使用 | ✅ |
| XSS-01 例外: facesjs SVG は innerHTML 使用（ライブラリ生成、ユーザー入力なし） | ✅（承認済み） |
| AUTH-05: accessToken / idToken はメモリのみ | ✅ |
| TOTP 入力: `type="text" inputmode="numeric"`（type="number" 禁止） | ✅ |
| ユーザー列挙防止: NotAuthorizedException / UserNotFoundException 同一メッセージ | ✅ |
| crypto.getRandomValues() シード（Date.now() 禁止） | ✅ |
