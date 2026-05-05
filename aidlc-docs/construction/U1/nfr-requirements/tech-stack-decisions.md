# U1 技術スタック決定（Tech Stack Decisions）
> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）

---

## フロントエンド技術スタック

| 技術 | 選定 | 根拠 |
|-----|:----:|------|
| HTML/CSS/JavaScript | Vanilla（フレームワークなし） | U0 方針�踏襲。依存関係ゼロ、CloudFront + S3 直配信に最適 |
| CSS フレームワーク | **なし** | flexbox/grid で十分。ファイルサイズ最小化 |
| モジュール方式 | ES Modules（`type="module"`） | U0 shared モジュールが ES Modules で実装済み |
| アバターライブラリ | facesjs（U0フォーク版 IIFE バンドル） | U0 で `frontend/assets/facesjs.min.js` として配置済み |
| 乱数生成 | `crypto.getRandomValues()` | Date.now()より確実なランダム性。Chrome/Safari サポート済み |

## 認証技術スタック

| 技術 | 選定 | 根拠 |
|-----|:----:|------|
| 認証プロバイダー | **AWS Cognito User Pool** | U0 インフラで既にデプロイ済み（`ap-northeast-1_hwx2hpNGn`） |
| Cognito 統合方式 | **Cognito REST API 直接呼び出し**（SDK不使用） | ブラウザバンドルサイズ削減。Amplify JS（300KB+）は不要 |
| Cognito エンドポイント | `https://cognito-idp.ap-northeast-1.amazonaws.com/` | REST API（`X-Amz-Target` ヘッダー方式） |
| MFA方式 | SOFTWARE_TOKEN_MFA（TOTP） | U0 Cognito設定に準拠（`MfaConfiguration: ON`） |
| トークン保管 | refreshToken→localStorage / 他→メモリ | XSS攻撃対策（AUTH-05） |

## Cognito API 直接呼び出し実装メモ

```javascript
// ログイン例（Amplify SDK 不使用）
const response = await fetch(
  'https://cognito-idp.ap-northeast-1.amazonaws.com/',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: '2bf54jcqtgpaubsmbe9qoprq1v',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  }
);
```

> **注意**: U0 の `auth.js` は既にこのパターンを使用。U1 では refreshToken 対応に拡張するのみ。

## テスト技術スタック

| 技術 | 用途 |
|-----|------|
| fast-check | Property-Based Testing（バリデーション関数）。U0 PBT-01 準拠 |
| 手動テスト | 認証フロー確認（Cognito デプロイ環境） |
