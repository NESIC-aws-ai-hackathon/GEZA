# U1 非機能要件（NFR Requirements）
> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）  
> ステータス: 承認済み

---

## 前提

U1 はフロントエンド専用ユニット（バックエンド Lambda なし）。  
Lambda・DynamoDB・API GW のNFRはU0で定義済みのため、本書ではフロントエンド固有のNFRを定義する。

---

## 1. パフォーマンス要件

### 1.1 ページロード目標

| 指標 | 目標値 | 計測基準 |
|------|:------:|---------|
| Time to Interactive（TTI） | **5秒以内** | Wi-Fi / LTE 前提（U0 NFR 既定値に準拠） |
| アバター初回描画（facesjs.generate → SVG描画） | **1秒以内** | DOMContentLoaded 後から計測 |
| ログイン→TOP画面遷移（認証完了 → セクション切替） | **0.5秒以内** | Cognito API応答後のDOM操作のみ（API往復時間除く） |

### 1.2 アバター描画パフォーマンス

- `facesjs.generate({ seed })` はCPUバウンドだが同期実行で 10〜50ms 程度
- `faceToSvgString()` の出力は信頼済みライブラリ（facesjs）が生成するSVG文字列であり、ユーザー入力を一切含まない。XSS-01 の例外として `innerHTML` で挿入する（下記 2.2 の「ユーザー入力の DOM 挿入禁止」とは対象が異なる）
- アイドルアニメーションは CSS animation のみ（requestAnimationFrame 不使用）
- リフロー最小化のため、アバター描画は `DOMContentLoaded` 後に実行

---

## 2. セキュリティ要件

### 2.1 トークン管理（AUTH-05）

| トークン種別 | 保管場所 | 根拠 |
|------------|:-------:|------|
| refreshToken | `localStorage['geza_refresh_token']` | セッション間の認証維持が必要 |
| idToken | メモリ（モジュール変数） | XSS攻撃でのトークン漏洩を防ぐ |
| accessToken | メモリ（モジュール変数） | 同上 |

> **リスク**: localStorageはXSSで読み取り可能。ただしrefreshTokenはCognitoのIPバインディング・ローテーションで保護される。

### 2.2 XSS 対策（XSS-01）

- 全ユーザー入力のDOM挿入: `textContent` / `value` のみ。`innerHTML` 使用禁止
- エラーメッセージ表示: `element.textContent = message`
- Content Security Policy (CSP) ヘッダー: CloudFront ResponseHeadersPolicy で設定済み（U0）

### 2.3 認証セキュリティ

| 項目 | 実装内容 |
|------|---------|
| ブルートフォース対策 | Cognito のアカウントロック機能に委任（フロントエンド追加制限なし） |
| エラーメッセージの情報漏洩防止 | `NotAuthorizedException` / `UserNotFoundException` を同一文言で返す |
| TOTPセキュリティ | Cognito `SOFTWARE_TOKEN_MFA` に委任（タイムベースOTP、30秒有効） |
| ログアウト | `globalSignOut` でサーバーサイドセッションも無効化 |
| トークンリフレッシュ失敗 | 自動ログアウト（ログイン画面に戻る） |

### 2.4 入力バリデーション（SECURITY-05）

- メール: フォーム送信時にRFC5322形式チェック（`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`）
- パスワード: 12文字以上チェック（Cognito Policy と一致）
- TOTPコード: 6桁数字のみ（`/^\d{6}$/`）。正規表現は先頭ゼロ（000000〜999999）を正しくマッチする
  - TOTP入力欄: `<input type="text" inputmode="numeric" maxlength="6" pattern="\d{6}">` （`type="number"` は先頭ゼロが消えるため使用禁止）
- バリデーション失敗時: APIを呼び出さずにフロントエンドでエラー表示

---

## 3. ブラウザ対応要件

| ブラウザ | バージョン | 対応レベル |
|---------|-----------|:--------:|
| Chrome | 最新版 | 完全対応 |
| Safari | 最新版（iOS含む） | 完全対応 |
| Firefox | - | 対象外 |
| Edge | - | 対象外（Chromiumベースのため動作する可能性あり） |

**Safari 固有の考慮事項**:
- `crypto.getRandomValues()`: Safari 11+ でサポート ✅
- `localStorage`: Safari のITP（Intelligent Tracking Prevention）でサードパーティコンテキストでは制限されるが、ファーストパーティ（CloudFrontドメイン直アクセス）なので問題なし ✅
- CSS `transition`: 完全サポート ✅

---

## 4. アクセシビリティ要件

- **スコープ外**（ハッカソンMVPスコープ）
- WCAG 2.1 AA 準拠は実施しない
- ただし最低限の実装として以下は自然に対応:
  - フォームの `<label>` 要素とinputの紐付け（セマンティックHTML）
  - ボタンの `type="button"` / `type="submit"` 明示

---

## 5. レスポンシブデザイン要件

| ブレークポイント | 仕様 |
|----------------|------|
| スマホ（375px〜） | 基本レイアウト。縦積み構成 |
| PC（768px〜） | スマホ幅（375px）を中央表示。背景のみ広がる |

- Vanilla CSS（flexbox）のみ使用
- CSS フレームワークなし
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 必須

---

## 6. テスト要件

| テスト種別 | 対象 | 実施方針 |
|-----------|------|---------|
| 手動テスト | 認証フロー（ログイン・MFA・ログアウト・リフレッシュ） | U1 Code Generation 完了後にデプロイして確認 |
| スモークテスト | CloudFront から index.html が 200 で返る | デプロイパイプラインで確認 |
| ユニットテスト | バリデーション関数（メール・パスワード・TOTP） | Code Generation で実装 |
| Property-Based Test | バリデーション関数（fast-check） | U0 NFR PBT-01 準拠 |

---

## 7. 依存NFR（U0からの継承）

以下はU0で定義済み。U1 でも有効。

| NFR項目 | U0定義値 |
|---------|---------|
| CloudFront HTTPS強制 | HTTP → HTTPS リダイレクト有効 |
| セキュリティヘッダー | CSP / HSTS / XContentType / XFrameOptions / XSSProtection（CloudFront設定済み） |
| フロントエンド初期ロード | 5秒以内（Wi-Fi/LTE前提） |
| S3バケットパブリックアクセス | ブロック済み（OAC経由のみ） |
