# U1 NFR 設計パターン
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）  
> ステータス: 承認待ち

---

## 1. 認証セキュリティパターン

### 1.1 ハイブリッドトークンストレージパターン（AUTH-05）

**適用理由**: XSSリスクを最小化しつつ、ブラウザ再起動後の認証維持（AC-3）を実現する。

```
┌─────────────────────────────────────────┐
│           Token Storage Model           │
│                                         │
│  localStorage                           │
│  ┌──────────────────────────────────┐   │
│  │ geza_refresh_token (30日有効)     │   │
│  │ ※ XSSで読まれても短命でない      │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Memory (モジュールスコープ変数)         │
│  ┌──────────────────────────────────┐   │
│  │ idToken      (1時間有効)          │   │
│  │ accessToken  (1時間有効)          │   │
│  │ tokenExpiry  (epoch ms)           │   │
│  └──────────────────────────────────┘   │
│  ※ ページリロードで消去 → 再リフレッシュ │
└─────────────────────────────────────────┘
```

**トークンライフサイクル**:

```
ページ読み込み
  └─ localStorage に refreshToken あり？
       Yes → Cognito.initiateAuth(REFRESH_TOKEN)
              └─ 成功: idToken/accessToken をメモリに格納
              └─ 失敗: localStorage 削除 → ログイン画面
       No  → ログイン画面

API 呼び出し前
  └─ tokenExpiry まで < 5分？
       Yes → サイレントリフレッシュ
       No  → そのまま使用

ログアウト
  └─ Cognito.globalSignOut（accessToken 使用）
  └─ localStorage 削除
  └─ メモリクリア
```

### 1.2 MFA チャレンジフロー分離パターン

**適用理由**: Cognito の `initiateAuth` は TOTP が有効なユーザーに対して `SOFTWARE_TOKEN_MFA` チャレンジを返す。2段階のUIフロー（パスワード入力 → TOTPコード入力）を状態管理で明確に分離する。

```
UI状態: 'password-form' → 'mfa-form' → 'authenticated'

[password-form]
  ユーザーがメール + パスワード入力
  → initiateAuth 呼び出し
     ├─ ChallengeName: 'SOFTWARE_TOKEN_MFA'
     │   → cognitoSession をメモリに保存
     │   → UI状態を 'mfa-form' へ遷移
     └─ 認証成功（MFA不要の場合）
         → UI状態を 'authenticated' へ遷移

[mfa-form]
  ユーザーが TOTP コード入力
  → respondToAuthChallenge 呼び出し
     ├─ 成功 → UI状態を 'authenticated' へ遷移
     └─ 失敗 → エラー表示（'mfa-form' を維持）
```

---

## 2. パフォーマンスパターン

### 2.1 遅延初期化パターン（アバター描画）

**適用理由**: 認証チェックと並行してアバターを描画し、体感的な初期ロード時間を短縮する。

```
DOMContentLoaded イベント
  ├─ [並行実行 A] アバター初期化
  │     └─ generateRandomSeed()
  │     └─ facesjs.generate({ seed })
  │     └─ SVG をアバターコンテナに描画（innerHTML で信頼済みSVG挿入）
  │     └─ .small クラスを付与
  └─ [並行実行 B] 認証状態チェック
        └─ localStorage から refreshToken 取得
        └─ サイレントリフレッシュ試行（Cognito API）

→ A完了: アバターが表示される（認証前でも視覚的フィードバックあり）
→ B完了: 認証成功 → .small → .large トランジション + TOP表示
         認証失敗 → ログイン画面を表示（アバターは維持）
```

**効果**: ユーザーは認証処理中もアバターを見続けられるため、待機感が軽減される。

### 2.2 CSS トランジションパターン（アバター拡大演出）

**適用理由**: W-2 対応。ログイン成功時の視覚的インパクトをデモ演出として組み込む。

```css
/* パターン実装（Code Generation 時） */
.avatar-container {
  transition: width 0.5s ease, height 0.5s ease;
  overflow: hidden;
}
.avatar-container.small { width: 80px;  height: 80px;  }
.avatar-container.large { width: 200px; height: 200px; }
```

```
ログイン成功イベント
  → container.classList.replace('small', 'large')
  → CSS transition が 0.5s で滑らかに拡大
  → トランジション完了後に AvatarController.playIdleAnimation() 呼び出し
```

---

## 3. エラー回復パターン

### 3.1 フォールバック表示パターン（エラーUX）

**適用理由**: Cognito エラーコードをユーザー向けメッセージに変換し、情報漏洩を防ぐ。

```
Cognito エラー発生
  ├─ NotAuthorizedException / UserNotFoundException
  │   → 同一メッセージ表示（ユーザー列挙攻撃防止）
  │   → "メールアドレスまたはパスワードが正しくありません"
  ├─ CodeMismatchException / ExpiredCodeException
  │   → MFA フォームにエラー表示
  ├─ PasswordResetRequiredException / UserNotConfirmedException
  │   → 管理者への連絡を促すメッセージ（サインアップUI不要のため）
  └─ NetworkError / その他
      → グローバルバナーに汎用メッセージ
      → element.textContent = message（XSS-01 準拠）

エラークリア条件
  → 次の入力操作 または フォーム再送信 でエラーをクリア
```

### 3.2 トークン失効回復パターン

**適用理由**: 長時間操作しないセッションでトークンが失効した場合の自動ログアウト。

```
API 呼び出し時
  → refreshToken で更新試行
     ├─ 成功: 新トークンでリトライ
     └─ 失敗（InvalidParameterException, NotAuthorizedException）:
         → localStorage['geza_refresh_token'] 削除
         → メモリクリア
         → window.location.href = '/index.html'
         → ログイン画面に戻る
```

---

## 4. セキュリティパターン

### 4.1 入力サニタイズパターン（XSS-01）

**適用理由**: ユーザー入力を DOM に反映する全箇所で `textContent` を使用し、XSS を防止する。

```javascript
// ✅ 安全なパターン
element.textContent = userInput;        // テキスト表示
input.value = sanitizedValue;           // input 要素への値設定
errorDiv.textContent = errorMessage;    // エラーメッセージ表示

// ❌ 禁止パターン（ユーザー入力に対して）
element.innerHTML = userInput;          // XSS リスク
element.insertAdjacentHTML('...', ...); // XSS リスク

// ✅ 例外: 信頼済みライブラリ生成コンテンツ
avatarContainer.innerHTML = faceToSvgString(faceConfig); // facesjs生成SVG（ユーザー入力なし）
```

### 4.2 認証ガードパターン（AuthGuard）

**適用理由**: 内部ページへの未認証アクセスをフロントエンドで防止する。

```javascript
// 全内部ページの先頭で呼び出す
export function requireAuth() {
  const token = localStorage.getItem('geza_refresh_token');
  if (!token) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

// U1 以降の各ページで使用例
// pages/inception.js
import { requireAuth } from '../shared/auth.js';
if (!requireAuth()) throw new Error('redirect'); // ページ処理中断
```

---

## 5. 状態管理パターン

### 5.1 セッションステート集中管理パターン

**適用理由**: 認証状態・アバター状態・UI状態を StateManager（U0 実装済み）で一元管理し、コンポーネント間の状態共有を安全に行う。

```
StateManager.session（U1 拡張分）
  ├─ auth
  │   ├─ isAuthenticated: boolean
  │   ├─ userId: string | null        ← メモリ
  │   ├─ idToken: string | null       ← メモリ
  │   ├─ accessToken: string | null   ← メモリ
  │   └─ tokenExpiry: number | null   ← メモリ
  ├─ bossAvatar
  │   ├─ faceConfig: object | null    ← メモリ（セッション中維持）
  │   ├─ angerLevel: number (初期: 80)
  │   ├─ trustLevel: number (初期: 10)
  │   └─ difficultyLevel: number (初期: 50)
  └─ ui
      ├─ currentSection: 'login' | 'top'
      ├─ mfaChallengeActive: boolean
      ├─ cognitoSession: string | null  ← MFAチャレンジ用
      ├─ isLoading: boolean
      ├─ loginError: string | null
      └─ mfaError: string | null

localStorage
  └─ geza_refresh_token: string | null
```

**変更フロー**: 全状態変更は `StateManager.set()` を通じて行い、直接変更禁止。
