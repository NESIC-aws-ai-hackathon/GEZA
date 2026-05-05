# U1 Functional Design
> AI-DLC CONSTRUCTION - Functional Design 成果物  
> ユニット: U1 トップ画面 + Cognito認証  
> 生成日: 2026-05-05  
> ステータス: 承認済み

---

## 設計方針サマリー

| 決定事項 | 内容 |
|---------|------|
| ページ構成 | 1ページ構成: index.html にログイン・TOPセクション共存。認証状態でセクション切り替え |
| アバター | ページ読み込み時に `facesjs.generate()` でランダム生成（シード: `crypto.getRandomValues()`）。セッション中維持 |
| 認証 | Cognito 管理者作成ユーザーのみ。サインアップUI不要。ログイン時TOTP入力あり |
| トークン保管 | refreshToken→localStorage / idToken・accessToken→メモリ（XSS軽減） |
| モード表示 | 4モード全て表示。未実装は `data-status="coming-soon"` でグレーアウト |
| ゲージ初期値 | 怒り度: 80 / 信頼度: 10 / 難易度: 50（U2で相手生成後に上書き） |
| CSS | Vanilla CSS（flexbox/grid）、フレームワークなし |

---

## Step 1: ドメインモデル

### エンティティ

#### AuthSession（認証セッション）

| フィールド | 型 | 保管場所 | 説明 |
|-----------|:--:|:-------:|------|
| userId | string | メモリ | Cognito sub（UUID） |
| email | string | メモリ | ログインメールアドレス |
| idToken | string | メモリ | Cognito ID Token（有効期限1h） |
| accessToken | string | メモリ | Cognito Access Token（有効期限1h） |
| refreshToken | string | localStorage | Cognito Refresh Token（有効期限30日） |
| tokenExpiry | number | メモリ | accessToken の有効期限 epoch ms |
| isAuthenticated | boolean | メモリ | 認証済みフラグ |

> **XSS対策**: idToken / accessToken はメモリのみ。XSS攻撃でlocalStorageが読まれても短命トークンの漏洩を防ぐ。

#### BossAvatar（謝罪ボスアバター）

| フィールド | 型 | 初期値 | 説明 |
|-----------|:--:|:-----:|------|
| faceConfig | object | `generate()` 結果 | facesjs の顔設定オブジェクト |
| angerLevel | number | 80 | 怒り度 0〜100（U2で上書き） |
| trustLevel | number | 10 | 信頼度 0〜100（U2で上書き） |
| difficultyLevel | number | 50 | 難易度 0〜100（U2で上書き） |

#### AppMode（モード定義）

```javascript
const AppMode = {
  REAL_CASE: { id: 'real',    label: '実案件モード',         icon: 'briefcase', target: 'pages/inception.html', available: false },
  STORY:     { id: 'story',   label: 'ストーリーモード',     icon: 'book',      target: 'pages/story.html',     available: false },
  KARTE:     { id: 'karte',   label: '謝罪カルテ',           icon: 'clipboard', target: 'pages/karte.html',     available: false },
  MANAGER:   { id: 'manager', label: '上司向けフィードバック', icon: 'user-tie',  target: 'pages/manager.html',   available: false },
};
```

> U2完了時に `REAL_CASE.available = true` に更新。以降のユニット完了時も順次更新。

---

## Step 2: 認証フロー詳細設計

### 前提

- Cognito User Pool: `AllowAdminCreateUserOnly = true`
- MFA: `ON`（TOTP必須）
- ユーザー作成・TOTP登録: 管理者が AWS Console または CLI で実施
- エンドユーザー向けサインアップUI: **不要**

### ログインフロー

```
[1] ユーザーがメール + パスワード入力して「ログイン」ボタン押下
      ↓
[2] バリデーション
    - メール形式チェック（RFC 5322）
    - パスワード 12文字以上チェック
    - NG → フォームにエラー表示。API呼び出し中断
      ↓
[3] Cognito.initiateAuth({ USERNAME, PASSWORD })
    - ローディング表示
      ↓
[4a] チャレンジ: NEW_PASSWORD_REQUIRED（管理者作成ユーザーの初回ログイン）
    → パスワード再設定フォームを表示（新パスワード入力欄）
    → ユーザーが新パスワード入力して送信
    → Cognito.respondToAuthChallenge({ NEW_PASSWORD_REQUIRED, newPassword })
    → 成功後: authFlowResult によってMFAチャレンジへ継続
      ↓
[4b] チャレンジ: MFA_SETUP（TOTP未設定ユーザーの初回MFA登録）
    → Cognito.associateToken() でQRコード用シークレット取得
    → QRコード生成（otpauth:// URI → Google Authenticator 等で読み込み）
    → シークレットキーも文字列で表示（コピー可）
    → ユーザーが認証アプリで登録後、TOTPコード入力して送信
    → Cognito.verifyToken() でTOTP検証
    → 成功後: SOFTWARE_TOKEN_MFA チャレンジへ継続
      ↓
[4c] チャレンジ: SOFTWARE_TOKEN_MFA（通常のMFA認証）
    → MFAフォームを表示（TOTPコード入力欄）
    → ユーザーがTOTPコード（6桁）入力して送信
    → Cognito.respondToAuthChallenge({ SOFTWARE_TOKEN_MFA, TOTP_CODE })
      ↓
[5a] 成功
    → AuthSession にトークンをセット
    → refreshToken → localStorage['geza_refresh_token']
    → idToken / accessToken → メモリ（AuthModule内部変数）
    → StateManager.session.auth を更新
    → ログアウトボタンを表示（hidden 属性解除）
    → ローディングスピナー非表示 → TOPセクション表示（requestAnimationFrame でアバター描画）
      ↓
[5b] 失敗（NotAuthorizedException / CodeMismatchException 等）
    → エラーメッセージ表示（後述）
```

> **実装変更メモ（コード生成後追加）**: 当初設計の SOFTWARE_TOKEN_MFA のみのフローに加え、管理者作成ユーザーの初回ログイン時に必要な NEW_PASSWORD_REQUIRED チャレンジと、TOTP未設定ユーザーの初回 MFA 登録フロー（MFA_SETUP）を auth.js に追加実装した。

### トークンリフレッシュフロー

```
[1] API呼び出し前に tokenExpiry チェック
    - 残り < 5分 → refreshToken で新規取得
      ↓
[2] Cognito.initiateAuth({ REFRESH_TOKEN, refreshToken })
      ↓
[3a] 成功 → idToken / accessToken をメモリ更新
[3b] 失敗（InvalidParameterException 等）→ ログアウト処理
```

### ログアウトフロー

```
[1] 「ログアウト」ボタン押下
      ↓
[2] Cognito.globalSignOut（accessToken を使用）
      ↓
[3] localStorage['geza_refresh_token'] 削除
[4] メモリ上のトークンをクリア
[5] StateManager.session.auth をリセット
[6] TOPセクション非表示 / ログインセクション表示
```

### ページ読み込み時の初期化フロー

```
[1] ページ読み込み完了
    → ローディングスピナー（#app-loading）を表示（フラッシュ防止）
    → login-section / top-section は hidden のまま
      ↓
[2] BossAvatar 生成: generateRandomSeed() → facesjs.generate({ seed }) でランダム生成
    → faceConfig のみ StateManager に保存（描画はまだ行わない）
      ↓
[3] localStorage['geza_refresh_token'] 確認
      ↓
[3a] 存在する → Cognito.initiateAuth(REFRESH_TOKEN) でサイレントリフレッシュ
      - 成功 → ローディング非表示 → TOPセクション表示 → requestAnimationFrame でアバター描画
      - 失敗 → ローディング非表示 → ログインセクション表示
[3b] 存在しない → ローディング非表示 → ログインセクション表示
```

> **実装変更メモ（コード生成後追加）**: 当初設計ではログインセクションをデフォルト表示していたが、認証チェック中にログイン画面が一瞬表示される「フラッシュ問題」が発生した。対策として、初期表示を #app-loading スピナーに変更し、認証チェック完了後に適切なセクションを表示するよう変更した。また、facesjs の getBBox() が hidden 要素で 0 を返す問題（SVG崩れ）を回避するため、アバター描画は TOPセクション表示後の requestAnimationFrame コールバック内で実施する設計に変更した。

---

## Step 3: 画面遷移・ルーティング設計

### ページ構成（1ページ構成）

```
frontend/index.html
  ├── <header class="app-header">（共通ヘッダー、全セクション共通表示）
  │     ├── .app-header-brand（アイコン画像 + GEZAテキスト）
  │     └── #logout-btn       （ログアウトボタン、ログイン時のみ表示 hidden 解除）
  ├── #app-loading  （初期表示スピナー → 認証チェック後に hidden）
  ├── #login-section （初期 hidden）
  │     ├── #login-form      （メール + パスワード）
  │     ├── #new-password-form（NEW_PASSWORD_REQUIRED チャレンジ用）
  │     ├── #mfa-setup-form  （MFA_SETUP チャレンジ用 QR + TOTP入力）
  │     └── #mfa-form        （SOFTWARE_TOKEN_MFA チャレンジ用 TOTP入力）
  └── #top-section     （認証後表示）
        ├── #avatar-section  （アバター大サイズ）
        ├── .status-card     （謝罪状況カード: 進行中案件 / 次のタスク / 練習回数）
        └── #mode-selector   （モードボタン — 耳打ちモードのみ available）
```

> **実装変更メモ（コード生成後追加）**: ゲージセクション（怒り度/信頼度/難易度）は TOP 画面の初期表示では不要と判断し削除。代わりに謝罪状況カード（現在の進行中案件・次のタスク・練習回数）を追加。耳打ちモード（mimicry）を available=true に変更（pages/mimicry.html に遷移）。ヘッダーをセクション外の共通要素として配置し、ログアウトボタンを内包。

### セクション切り替えロジック

```javascript
function showSection(sectionId) {
  document.querySelectorAll('.page-section').forEach(s => s.hidden = true);
  document.getElementById(sectionId).hidden = false;
}
```

### 画面遷移マトリクス

| 現在地 | イベント | 遷移先 | 備考 |
|--------|---------|--------|------|
| #login-section | ログイン成功 | #top-section | |
| #login-section | リフレッシュ成功 | #top-section | ページ読み込み時 |
| #top-section | ログアウト | #login-section | |
| #top-section | 実案件モードボタン（available=true） | pages/inception.html | U2完了後 |
| #top-section | ストーリーモードボタン（available=true） | pages/story.html | U5完了後 |
| #top-section | 謝罪カルテボタン（available=true） | pages/karte.html | U4完了後 |
| #top-section | 上司フィードバックボタン（available=true） | pages/manager.html | U6完了後 |
| 任意の内部ページ | 未認証アクセス | index.html | AuthGuard発動 |

---

## Step 4: UIコンポーネント構造設計

### コンポーネントツリー

```
IndexPage (index.html + top.js)
├── AppHeader（共通ヘッダー）
│   ├── AppHeaderBrand
│   │   ├── AppHeaderIcon（geza_icon.png）
│   │   └── AppHeaderTitle（「GEZA」テキスト）
│   └── LogoutButton（#logout-btn, hidden → ログイン後表示）
├── AppLoading (#app-loading, 初期表示 → 認証チェック後 hidden)
│   └── LoadingSpinner（CSS アニメーション）
├── LoginSection (#login-section, 初期hidden)
│   ├── LoginForm (#login-form)
│   │   ├── EmailInput
│   │   ├── PasswordInput（目アイコンで表示切替）
│   │   ├── LoginButton（ローディングスピナー内蔵）
│   │   └── ErrorMessage（条件付き表示）
│   ├── NewPasswordForm (#new-password-form, 初期hidden)
│   │   ├── NewPasswordInput
│   │   ├── SubmitButton
│   │   └── ErrorMessage
│   ├── MFASetupForm (#mfa-setup-form, 初期hidden)
│   │   ├── QRCodeDisplay（otpauth:// URI から canvas または <img> で表示）
│   │   ├── SecretKeyText（コピー可）
│   │   ├── TOTPInput（6桁）
│   │   ├── SubmitButton
│   │   └── ErrorMessage
│   └── MFAForm (#mfa-form, 初期hidden)
│       ├── TOTPInput（数字6桁）
│       ├── SubmitButton
│       └── ErrorMessage
└── TopSection (#top-section, 初期hidden)
    ├── AvatarSection
    │   └── AvatarDisplay（.avatar-frame.large > .facesjs-container > svg）
    ├── StatusCard (.status-card)
    │   ├── StatusItem[ACTIVE_CASES]（進行中案件）
    │   ├── StatusItem[NEXT_TASK]（次のタスク）
    │   └── StatusItem[PRACTICE_COUNT]（練習回数）
    └── ModeSelector (#mode-selector)
        ├── ModeButton[MIMICRY]（available=true → pages/mimicry.html へ遷移）
        ├── ModeButton[REAL_CASE]（coming-soon）
        ├── ModeButton[STORY]（coming-soon）
        ├── ModeButton[KARTE]（coming-soon）
        └── ModeButton[MANAGER]（coming-soon）
```

> **実装変更メモ（コード生成後追加）**: ログイン画面でのアバター表示は廃止（DOM上は非表示）。アバターはTOP画面のみに大サイズで表示。初期フラッシュ防止のためAppLoadingを追加。MFA_SETUPフローのQRコード画面を追加。ゲージセクションを削除しStatusCardに置き換え。耳打ちモードを available=true に変更。

### AvatarDisplay 動作仕様

- ページ読み込み時に `facesjs.generate({ seed })` でランダム生成（描画はしない）
- `faceConfig` を `StateManager.set('bossAvatar', { faceConfig })` で保存
- TOPセクション表示後に `requestAnimationFrame` で `facesjs.display()` を呼び出す
  - 理由: `facesjs.display()` 内部の `getBBox()` が `hidden` 要素で常に `0` を返すため SVG が崩れる。セクション表示後の rAF で描画することで回避。
- SVG 構造: `.avatar-frame > .facesjs-container > svg`
  - `.avatar-frame`: `position:relative; overflow:hidden; width:260px; height:320px; border-radius:20px`
  - `.facesjs-container`: `position:absolute; top:-55px; left:0; right:0; bottom:0`（上部55pxオフセットでプロトタイプと同等の表示位置）
  - `svg`: `width:100%; height:100%; display:block; preserveAspectRatio="xMidYMin slice"`
- アイドルアニメーション（CSS）: `@keyframes headIdle` で `translateY + rotate` を微小変化
- ログイン画面ではアバター非表示（`display:none`）

> **実装変更メモ（コード生成後追加）**: 当初設計では small → large のトランジション演出を行う予定だったが、facesjs の getBBox() 問題回避のためログイン画面でのアバター表示を廃止。TOP 画面のみで large サイズのアバターを表示する設計に変更した。SVG の 2 層構造（avatar-frame > facesjs-container）はプロトタイプの CSS 設計を完全踏襲。

### ModeButton 仕様

```javascript
// data-status="available" → 通常表示、クリックでページ遷移
// data-status="coming-soon" → グレーアウト + 「準備中」バッジ、クリック無効
<button class="mode-btn" data-mode="real" data-status="coming-soon">
  <span class="mode-icon">💼</span>
  <span class="mode-label">実案件モード</span>
  <span class="mode-desc">実際の謝罪の練習</span>
  <span class="coming-soon-badge">準備中</span>
</button>
```

---

## Step 5: ビジネスルール・バリデーション

### 入力バリデーション

| フィールド | ルール | エラーメッセージ |
|-----------|--------|----------------|
| メールアドレス | RFC 5322 形式 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | 「有効なメールアドレスを入力してください」 |
| パスワード | 12文字以上 | 「パスワードは12文字以上で入力してください」 |
| TOTPコード | 6桁数字 `/^\d{6}$/` | 「6桁の認証コードを入力してください」 |

- バリデーションはフォーム送信時に実行
- XSS対策: 全ユーザー入力は `textContent` / `value` でのみ DOM に挿入。`innerHTML` 使用禁止

### 認証ガード（AuthGuard）

```javascript
// auth.js に追加
export function requireAuth() {
  const token = localStorage.getItem('geza_refresh_token');
  if (!token) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}
```

### アバター生成ルール

```javascript
// [W-3] Date.now() 単体は同一ミリ秒アクセスで同じシードになるため
//        crypto.getRandomValues() で 32bit 乱数を生成してシードに使用
function generateRandomSeed() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

function initializeBossAvatar() {
  const seed = generateRandomSeed();
  const faceConfig = generate({ seed }); // facesjs.generate({ seed })
  StateManager.set('session', 'bossAvatar.faceConfig', faceConfig);
  AvatarController.render(faceConfig, document.getElementById('avatar-container'));
  // ログインセクションでは small クラス。ログイン成功後に large へ
  document.getElementById('avatar-container').classList.add('small');
}
```

- 同一セッション中は再生成しない（StateManager に保存済みなら再利用）
- U2 で相手生成後に `faceConfig` を上書き

---

## Step 6: フロントエンドステート管理設計

### StateManager 利用方針

U0 の `state.js`（3層ステート管理）を活用。

#### Session Layer（認証 + アバター）

```javascript
// StateManager.session の初期構造（U1 追加分）
{
  auth: {
    isAuthenticated: false,
    userId: null,
    email: null,
    accessToken: null,   // メモリのみ
    idToken: null,       // メモリのみ
    tokenExpiry: null,
  },
  bossAvatar: {
    faceConfig: null,    // facesjs generate() 結果
    angerLevel: 80,
    trustLevel: 10,
    difficultyLevel: 50,
  },
  ui: {
    currentSection: 'login',  // 'login' | 'top'
    mfaChallengeActive: false,
    cognitoSession: null,      // MFAチャレンジ用 Cognito session token
    isLoading: false,
    loginError: null,
    mfaError: null,
  }
}
```

#### LocalStorage（永続化）

| キー | 値 | 用途 |
|------|-----|------|
| `geza_refresh_token` | string | Cognito Refresh Token |

---

## Step 7: エラーハンドリング設計

### Cognito エラーコード → UXメッセージ変換

| Cognito エラーコード | 表示メッセージ | 表示場所 |
|---------------------|--------------|---------|
| `NotAuthorizedException` | 「メールアドレスまたはパスワードが正しくありません」 | #login-form エラー欄 |
| `UserNotFoundException` | 「メールアドレスまたはパスワードが正しくありません」（セキュリティのため同一文言） | #login-form エラー欄 |
| `CodeMismatchException` | 「認証コードが正しくありません。もう一度お試しください」 | #mfa-form エラー欄 |
| `ExpiredCodeException` | 「認証コードの有効期限が切れました。ログインからやり直してください」 | #mfa-form エラー欄 |
| `PasswordResetRequiredException` | 「パスワードのリセットが必要です。管理者にお問い合わせください」 | #login-form エラー欄 |
| `UserNotConfirmedException` | 「アカウントが確認されていません。管理者にお問い合わせください」 | #login-form エラー欄 |
| `NetworkError` / fetch失敗 | 「接続を確認してください」 | グローバルバナー |
| その他 / 予期しないエラー | 「エラーが発生しました。しばらくしてからお試しください」 | グローバルバナー |

- エラーメッセージは `element.textContent = message`（XSS-01 準拠）
- 次の操作（入力変更・再送信）でエラーをクリア

---

## 成果物サマリー（U1 で生成・更新したファイル）

| ファイル | 種別 | 説明 |
|---------|:----:|------|
| `frontend/index.html` | 更新 | 共通ヘッダー + AppLoading + ログイン（各チャレンジフォーム含む） + TOPセクション（状況カード + モードセレクター） |
| `frontend/style.css` | 更新 | ダークテーマ全面書き換え。アバター2層構造・headIdle animation・ローディングスピナー・状況カード・モードボタン CSS を追加 |
| `frontend/pages/top.js` | 更新 | _initAvatar（生成のみ）/ _renderAvatar（描画）分離。_onLoginSuccess で rAF 遅延描画。_showSection でローディング非表示化 |
| `frontend/shared/auth.js` | 更新 | submitNewPassword / setupTOTP / verifyTOTPSetup 追加。NEW_PASSWORD_REQUIRED / MFA_SETUP チャレンジ対応 |
| `frontend/shared/avatar.js` | 修正 | `window.faces` → `window.facesjs` 全置換（3箇所）|

> `frontend/shared/anger-gauge.js` は TOP 画面でのゲージ表示廃止のため U1 では未使用。  
> `frontend/shared/avatar.js`（U0実装済み）をアバター表示に再利用（facesjs API名修正済み）。

---

## 依存関係確認

| 依存成果物 | 実装済み | 備考 |
|-----------|:-------:|------|
| auth.js（U0） | ✅ | submitNewPassword / setupTOTP / verifyTOTPSetup 追加（本ユニット） |
| api.js（U0） | ✅ | U1では未使用（認証は Cognito REST API 直接呼び出し） |
| state.js（U0） | ✅ | session layer を拡張して利用 |
| avatar.js（U0） | ✅ | `window.facesjs` 修正済み。`display()` 利用 |
| anger-gauge.js（U0） | — | U1 TOP画面ではゲージ非表示のため未使用 |
| facesjs.min.js | ✅ | U1 で `frontend/assets/` に配置（prototype/ からコピー）|
| Cognito User Pool | ✅ | `ap-northeast-1_hwx2hpNGn`（U0デプロイ済み） |

---

## 拡張性メモ（将来フェーズ向け）

- U2: `bossAvatar.faceConfig` / `angerLevel` / `trustLevel` / `difficultyLevel` を相手生成結果で上書き
- U2: `AppMode.REAL_CASE.available = true` に変更 → 実案件モードボタンを有効化
- U4: `AppMode.KARTE.available = true` に変更
- U5: `AppMode.STORY.available = true` に変更
- U6: `AppMode.MANAGER.available = true` に変更
