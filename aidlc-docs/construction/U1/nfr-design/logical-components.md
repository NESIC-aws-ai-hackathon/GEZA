# U1 論理コンポーネント設計
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）  
> ステータス: 承認待ち

---

## コンポーネント一覧

| コンポーネント | 種別 | 役割 | 実装ファイル |
|-------------|:----:|------|------------|
| AuthModule | 更新 | Cognito認証・トークン管理 | `frontend/shared/auth.js` |
| TopPageController | 新規 | TOP画面全体制御 | `frontend/pages/top.js` |
| AvatarInitializer | 新規（top.js 内） | アバターランダム生成・描画 | `frontend/pages/top.js` |
| SectionManager | 新規（top.js 内） | ページセクション切り替え | `frontend/pages/top.js` |
| GaugeRenderer | 廃止 | TOP画面でのゲージ表示は U1 スコープ外と判断。StatusCardに置き換えたため実装しない |
| StatusCardController | 新規（top.js 内） | 謝罪状況カード表示（進行中案件・次のタスク・練習回数） | `frontend/pages/top.js` |
| ModeSelectorController | 新規（top.js 内） | モードボタン制御・遷移 | `frontend/pages/top.js` |
| StateManager（U0） | 継承 | セッションステート一元管理 | `frontend/shared/state.js` |
| AvatarController（U0） | 継承 | facesjs SVG描画・アニメーション | `frontend/shared/avatar.js` |
| AngerGauge（U0） | 継承 | 怒り度ゲージUIコンポーネント | `frontend/shared/anger-gauge.js` |

---

## コンポーネント詳細

### AuthModule（更新）

**責務**: Cognito との全通信・トークンライフサイクル管理

```
AuthModule
├─ login(email, password)
│   └─ Cognito.initiateAuth (USER_PASSWORD_AUTH)
│   └─ チャレンジ判定 → MFA フロー or 認証成功処理
├─ submitMFA(totpCode, cognitoSession)
│   └─ Cognito.respondToAuthChallenge (SOFTWARE_TOKEN_MFA)
│   └─ 認証成功処理
├─ logout()
│   └─ Cognito.globalSignOut
│   └─ トークンクリア + localStorage 削除
├─ silentRefresh()
│   └─ Cognito.initiateAuth (REFRESH_TOKEN)
│   └─ 成功: メモリ更新 / 失敗: logout()
├─ requireAuth()          ← 内部ページ認証ガード
│   └─ localStorage 確認 → なければ index.html へリダイレクト
├─ getAccessToken()       ← API 呼び出し前にトークン有効期限チェック
│   └─ 残り < 5分 → silentRefresh() を呼ぶ
└─ [内部] _handleAuthSuccess(tokens)
    └─ refreshToken → localStorage
    └─ idToken / accessToken / tokenExpiry → メモリ
    └─ StateManager.session.auth 更新
```

**U0からの変更点**:
- `sessionStorage` → `localStorage` への移行（refreshToken のみ）
- `silentRefresh()` メソッド追加
- `requireAuth()` メソッド追加（U1以降の全ページで使用）
- `getAccessToken()` 内に自動リフレッシュロジック追加

---

### TopPageController（新規）

**責務**: TOP画面の初期化オーケストレーション

```
TopPageController
├─ init()                 ← DOMContentLoaded で呼び出し
│   ├─ [並行] AvatarInitializer.init()
│   └─ [並行] _checkAuthState()
│       ├─ AuthModule.silentRefresh()
│       │   ├─ 成功 → SectionManager.showTop()
│       │   └─ 失敗 → SectionManager.showLogin()
│       └─ StateManager.session.ui を更新
├─ onLoginSuccess(tokens)
│   ├─ SectionManager.showTop()
│   └─ AvatarInitializer.expandAvatar()  ← .small → .large
└─ onLogout()
    └─ SectionManager.showLogin()
```

---

### AvatarInitializer（新規、top.js 内）

**責務**: アバターのランダム生成・描画

```
AvatarInitializer
├─ init() ← DOMContentLoaded 時に実行（描画はしない）
│   ├─ generateRandomSeed()              ← crypto.getRandomValues()
│   ├─ facesjs.generate({ seed })
│   └─ StateManager.set('bossAvatar', { faceConfig, angerLevel:80, trustLevel:10, difficultyLevel:50 })
└─ render(containerId, faceConfig)      ← TOPセクション表示後に requestAnimationFrame で呼び出し
    ├─ facesjs.display(containerId, faceConfig)
    ├─ svg.setAttribute('preserveAspectRatio', 'xMidYMin slice')
    └─ #face-group wrap（headIdle animation 用）
```

> **実装変更**: `expandAvatar()` は廃止（ログイン画面でアバター表示なしのため不要）。描画は常に TOP セクション表示後の rAF 内で実施。

---

### SectionManager（新規、top.js 内）

**責務**: ページセクションの表示切り替え

```
SectionManager / _showSection(sectionId)
├─ showLogin()
│   ├─ #app-loading を hidden
│   ├─ 全 .page-section を hidden
│   └─ #login-section を表示
├─ showTop()
│   ├─ #app-loading を hidden
│   ├─ 全 .page-section を hidden
│   ├─ #top-section を表示
│   └─ StateManager.session.ui.currentSection = 'top'
├─ showMFAForm()
│   ├─ #login-form を hidden
│   └─ #mfa-form を表示
├─ showNewPasswordForm()
│   ├─ #login-form を hidden
│   └─ #new-password-form を表示
└─ showMFASetupForm(secretCode, email)
    ├─ #login-form を hidden
    ├─ QRコード表示（otpauth:// URI → canvas）
    └─ #mfa-setup-form を表示
```

---

### StatusCardController（新規、top.js 内）

**責務**: TOP画面の謝罪状況カード表示

```
StatusCardController
└─ render()
    ├─ #active-cases: StateManager から進行中案件数（初期値: "なし"）
    ├─ #next-task: 次のタスク（初期値: "新しい謝罪を始めましょう"）
    └─ #practice-count: 練習回数（初期値: "0 回"）
```

> U2以降のユニットで DynamoDB から実データに切り替える。

---

### ModeSelectorController（新規、top.js 内）

**責務**: モード選択ボタンの状態管理と遷移制御

```
ModeSelectorController
├─ init()
│   └─ 全 .mode-btn に対してイベントリスナー登録
│       ├─ data-status="available"    → クリックで data-target URL に遷移
│       └─ data-status="coming-soon" → クリック無効（cursor: not-allowed）
└─ enableMode(modeId)    ← 各ユニット完了時に呼び出し（U2, U4, U5, U6）
    └─ 該当ボタンの data-status を "available" に更新
    └─ 「準備中」バッジを非表示
```

> **実装変更**: 耳打ちモード（mimicry）を data-status="available" として実装。`data-target="pages/mimicry.html"` で遷移する。その他 4 モードは coming-soon。

---

## コンポーネント間依存関係

```
TopPageController
  ├─ AuthModule (auth.js)
  ├─ StateManager (state.js)
  ├─ AvatarInitializer
  │     ├─ avatar.js (window.facesjs 使用)
  │     └─ facesjs (assets/facesjs.min.js)
  ├─ SectionManager
  │     └─ #app-loading スピナー制御
  ├─ StatusCardController
  └─ ModeSelectorController
```

---

## U0 からの変更サマリー

| ファイル | 変更種別 | 変更内容 |
|---------|:-------:|---------|
| `frontend/shared/auth.js` | 更新 | silentRefresh / requireAuth / getAccessToken / submitNewPassword / setupTOTP / verifyTOTPSetup 追加。sessionStorage → localStorage（refreshToken のみ）。NEW_PASSWORD_REQUIRED / MFA_SETUP チャレンジ対応 |
| `frontend/shared/avatar.js` | 修正 | `window.faces` → `window.facesjs` 全置換（3箇所）|
| `frontend/pages/top.js` | 更新 | TopPageController + AvatarInitializer + SectionManager + StatusCardController + ModeSelectorController。ゲージ除去。ローディングスピナー制御。rAF アバター描画 |
| `frontend/index.html` | 更新 | 共通ヘッダー + #app-loading + #login-section（新パスワード・ MFAセットアップ・ MFA各フォーム） + #top-section（状況カード + 耳打ちモードリンク）|
| `frontend/style.css` | 全面書き換え | ダークテーマ。アバター 2 層構造（.avatar-frame > .facesjs-container）。headIdle アニメーション。状況カード CSS |
