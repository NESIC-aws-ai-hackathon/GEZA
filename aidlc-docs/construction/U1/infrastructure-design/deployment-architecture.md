# U1 デプロイアーキテクチャ
> AI-DLC CONSTRUCTION Phase — Infrastructure Design  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）

---

## 1. デプロイフロー（U1）

```
┌──────────────────────────────────────────────────────────┐
│  開発者ローカル環境                                          │
│                                                          │
│  1. コード編集:                                            │
│     frontend/index.html    ← ログイン + TOP 1ページ構成     │
│     frontend/style.css     ← .small/.large トランジション   │
│     frontend/pages/top.js  ← TopPageController 新規       │
│     frontend/shared/auth.js ← silentRefresh 追加          │
│     frontend/assets/facesjs.min.js ← prototype/ からコピー │
│                                                          │
│  2. S3 アップロード:                                        │
│     $ aws s3 sync frontend/ s3://geza-static-.../        │
│       --delete --profile share                           │
│                                                          │
│  3. CloudFront キャッシュ無効化:                             │
│     $ aws cloudfront create-invalidation                 │
│       --distribution-id <ID> --paths "/*"                │
└──────────────────────────┬───────────────────────────────┘
                           │ AWS CLI (aws s3 sync)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  S3: geza-static-XXXXXXXXXXXX-ap-northeast-1             │
│  （CloudFront OAC 経由のみアクセス可）                        │
│                                                          │
│  /index.html        ← TTL=0（常に最新）                   │
│  /style.css         ← TTL=1年                           │
│  /config.js         ← TTL=1年                           │
│  /pages/top.js      ← TTL=1年（新規）                    │
│  /shared/auth.js    ← TTL=1年（更新）                    │
│  /shared/state.js   ← TTL=1年（変更なし）                │
│  /shared/avatar.js  ← TTL=1年（変更なし）                │
│  /shared/anger-gauge.js ← TTL=1年（変更なし）            │
│  /assets/facesjs.min.js ← TTL=1年（新規コピー）          │
└──────────────────────────┬───────────────────────────────┘
                           │ CloudFront OAC (sigv4)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  CloudFront Distribution                                 │
│  https://dhamuhqye8mp6.cloudfront.net                    │
│                                                          │
│  Response Headers: CSP / HSTS / X-Frame-Options          │
│  HTTPS リダイレクト: 有効                                  │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────┐
│  エンドユーザー ブラウザ                                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  U1 認証フロー                                     │   │
│  │                                                  │   │
│  │  index.html ロード                                │   │
│  │    ├─ [並行A] AvatarInitializer.init()            │   │
│  │    │     └─ facesjs.generate() → SVG 描画(.small) │   │
│  │    └─ [並行B] AuthModule.silentRefresh()          │   │
│  │          ├─ 成功 → #top-section 表示              │   │
│  │          └─ 失敗 → #login-section 表示            │   │
│  │                                                  │   │
│  │  ログイン成功時:                                    │   │
│  │    Cognito REST API ───────────────────────────►  │   │
│  │    https://cognito-idp.ap-northeast-1.amazonaws.com│  │
│  │    ◄─── JWT (idToken / accessToken / refreshToken)│   │
│  │    ├─ refreshToken → localStorage                │   │
│  │    ├─ idToken / accessToken → メモリ              │   │
│  │    └─ .small → .large アバタートランジション(0.5s) │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. U1 で追加・変更されるファイル一覧

| ファイル | 操作 | S3 パス |
|--------|:---:|--------|
| `frontend/index.html` | **更新** | `/index.html` |
| `frontend/style.css` | **更新** | `/style.css` |
| `frontend/pages/top.js` | **新規** | `/pages/top.js` |
| `frontend/shared/auth.js` | **更新** | `/shared/auth.js` |
| `frontend/assets/facesjs.min.js` | **新規** | `/assets/facesjs.min.js` |

---

## 3. インフラ変更なしの根拠

| リソース | 状態 | 理由 |
|---------|:---:|------|
| CloudFormation スタック | 変更なし | 新規 AWS リソースなし |
| template.yaml | 変更なし | Lambda/DynamoDB/Cognito は U0 構成のまま |
| Cognito User Pool 設定 | 変更なし | `AllowAdminCreateUserOnly=true` は U0 で設定済み |
| API Gateway | 変更なし | U1 では Cognito 直呼び出しのみ（API GW 不使用） |
| DynamoDB | 変更なし | U1 はデータ読み書きなし |

---

## 4. スモークテスト（U1 デプロイ後）

```powershell
# CloudFront からindex.html を取得（200 が返ればOK）
$CF_DOMAIN = "https://dhamuhqye8mp6.cloudfront.net"
Invoke-WebRequest -Uri $CF_DOMAIN -UseBasicParsing | Select-Object StatusCode

# facesjs.min.js が S3 / CloudFront 経由で取得できるか確認
Invoke-WebRequest -Uri "$CF_DOMAIN/assets/facesjs.min.js" `
  -UseBasicParsing | Select-Object StatusCode
# → 200 が返ればOK

# top.js が取得できるか確認
Invoke-WebRequest -Uri "$CF_DOMAIN/pages/top.js" `
  -UseBasicParsing | Select-Object StatusCode
# → 200 が返ればOK
```
