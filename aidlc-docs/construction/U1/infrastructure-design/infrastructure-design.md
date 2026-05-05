# U1 インフラストラクチャ設計
> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）  
> 設計根拠: Q1=A / Q2=A / Q3=A  
> ステータス: 承認待ち

---

## 1. 設計サマリー

| 項目 | 決定値 |
|-----|-------|
| 新規 AWS リソース | **なし**（全リソースは U0 デプロイ済み） |
| フロントエンド配置 | `frontend/` → S3: `geza-static-<accountId>-<region>` |
| facesjs.min.js | `frontend/` に直接配置（prototype/ からコピー） |
| S3 アップロード | `aws s3 sync frontend/ s3://... --delete` を手動実行 |
| CDN キャッシュ無効化 | `aws cloudfront create-invalidation --paths "/*"` を手動実行 |
| template.yaml 変更 | **不要** |
| sam deploy 実行 | **不要**（コード変更のみのため） |

---

## 2. 使用リソース（U0 デプロイ済み）

### 2.1 CloudFront Distribution

| 設定項目 | 値 |
|---------|---|
| DistributionId | CloudFormation Outputs から取得 |
| ドメイン | `https://dhamuhqye8mp6.cloudfront.net` |
| S3 Origin | `geza-static-<accountId>-ap-northeast-1` |
| index.html TTL | 0（CachingDisabled） |
| *.js / *.css TTL | 1年（CachingOptimized） |
| HTTPS リダイレクト | 有効 |

### 2.2 S3 静的ホスティング

| 設定項目 | 値 |
|---------|---|
| バケット名 | `geza-static-<accountId>-ap-northeast-1` |
| パブリックアクセス | ブロック（CloudFront OAC 経由のみ） |
| アップロード対象 | `frontend/` 配下の全ファイル |

### 2.3 Cognito User Pool

| 設定項目 | 値 |
|---------|---|
| User Pool ID | `ap-northeast-1_hwx2hpNGn` |
| Client ID | `2bf54jcqtgpaubsmbe9qoprq1v` |
| フロー | USER_PASSWORD_AUTH + SOFTWARE_TOKEN_MFA |
| ユーザー作成 | 管理者のみ（AllowAdminCreateUserOnly=true） |
| フロントエンドからの呼び出し | Cognito REST API 直接（Amplify SDK 不使用） |

### 2.4 API Gateway

| 設定項目 | 値 |
|---------|---|
| エンドポイント | `https://h6a2xx1i30.execute-api.ap-northeast-1.amazonaws.com` |
| 認証 | Cognito JWT Authorizer |
| U1 での使用 | なし（認証は Cognito REST API を直接呼び出し） |

---

## 3. フロントエンドファイル構成

```
frontend/                      ← aws s3 sync 対象ルート
├── index.html                 【更新】共通ヘッダー + AppLoading + ログイン各チャレンジフォーム + TOP（状況カード・耳打ちリンク）
├── style.css                  【全面書き換え】ダークテーマ / アバター 2 層構造 / headIdle / スピナー / 状況カード
├── pages/
│   └── top.js                 【更新】TopPageController + StatusCardController + SectionManager + AvatarInitializer + ModeSelectorController
├── shared/
│   ├── auth.js                【更新】submitNewPassword / setupTOTP / verifyTOTPSetup 追加。NEW_PASSWORD_REQUIRED / MFA_SETUP 対応
│   ├── state.js               （U0 生成済み・変更なし）
│   ├── avatar.js              【修正】window.faces → window.facesjs 全置換（3箇所）
│   └── anger-gauge.js         （U0 生成済み・U1 では未使用）
├── assets/
│   └── facesjs.min.js         【新規コピー】prototype/frontend/ からコピー
└── config.js                  （U0 生成済み。COGNITO_USER_POOL_ID 等が設定済み）
```

---

## 4. Cognito REST API エンドポイント（フロントエンドから直接呼び出し）

U1 では Cognito の認証系 REST API を `fetch()` で直接呼び出す。

| 操作 | Endpoint | Action |
|-----|---------|--------|
| ログイン（パスワード） | `https://cognito-idp.ap-northeast-1.amazonaws.com/` | `AWSCognitoIdentityProviderService.InitiateAuth` |
| MFA チャレンジ応答 | 同上 | `AWSCognitoIdentityProviderService.RespondToAuthChallenge` |
| トークンリフレッシュ | 同上 | `AWSCognitoIdentityProviderService.InitiateAuth` (REFRESH_TOKEN) |
| グローバルサインアウト | 同上 | `AWSCognitoIdentityProviderService.GlobalSignOut` |

> **セキュリティ注**: Cognito REST API は `ClientId` と `AuthFlow` のみで認証可能（Client Secret 不要）。`ClientId` はフロントエンドコードに含まれるが、Cognito の設計上これは想定内。

---

## 5. デプロイ手順（U1 コード更新時）

```powershell
# 1. S3 アップロード（--delete で不要ファイルを削除）
$ACCOUNT_ID = aws sts get-caller-identity --profile share --query Account --output text
aws s3 sync frontend/ "s3://geza-static-$ACCOUNT_ID-ap-northeast-1/" `
  --delete --profile share --region ap-northeast-1

# 2. CloudFront キャッシュ無効化
$CF_ID = aws cloudformation describe-stacks --stack-name geza-app `
  --profile share --region ap-northeast-1 `
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" `
  --output text
aws cloudfront create-invalidation --distribution-id $CF_ID `
  --paths "/*" --profile share

# 3. 疎通確認
$CF_DOMAIN = aws cloudformation describe-stacks --stack-name geza-app `
  --profile share --region ap-northeast-1 `
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomain'].OutputValue" `
  --output text
Invoke-WebRequest -Uri "https://$CF_DOMAIN" -UseBasicParsing | Select-Object StatusCode
# → 200 が返ればOK
```

> **注**: `template.yaml` 変更がない場合は `sam build` / `sam deploy` 不要。

---

## 6. 環境変数・設定値（config.js）

U0 で生成した `frontend/config.js` に以下が設定済み（変更不要）:

```javascript
export const CONFIG = {
  COGNITO_REGION: 'ap-northeast-1',
  COGNITO_USER_POOL_ID: 'ap-northeast-1_hwx2hpNGn',
  COGNITO_CLIENT_ID: '2bf54jcqtgpaubsmbe9qoprq1v',
  API_ENDPOINT: 'https://h6a2xx1i30.execute-api.ap-northeast-1.amazonaws.com',
  CLOUDFRONT_DOMAIN: 'https://dhamuhqye8mp6.cloudfront.net',
};
```
