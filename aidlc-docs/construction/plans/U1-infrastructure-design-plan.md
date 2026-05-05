# U1 Infrastructure Design Plan
> AI-DLC CONSTRUCTION Phase — Infrastructure Design Plan  
> 生成日: 2026-05-05  
> 対象ユニット: U1（トップ画面 + Cognito認証）

---

## インフラ設計方針

U1 はフロントエンドのみ（HTML/CSS/JS）であり、新規 AWS リソースは一切不要。
U0 でデプロイ済みのインフラ（CloudFront / S3 / Cognito / API GW）をそのまま使用する。

---

## チェックリスト

- [x] Functional Design 確認（functional-design.md）
- [x] NFR Design 確認（nfr-design-patterns.md / logical-components.md）
- [ ] Q1-Q3 回答収集
- [ ] Infrastructure Design 成果物生成
- [ ] ユーザー承認

---

## 質問事項

### Q1: S3 静的ホスティング — デプロイ方式
U0 では `sam deploy` のみ実施しました。フロントエンドファイル（index.html / app.js 等）の S3 へのアップロードは以下どちらで行いますか？

[Answer]:  
- A: `sam deploy` 後に `aws s3 sync frontend/ s3://geza-static-XXXXXXXXXXXX-ap-northeast-1/` を手動実行  
- B: `template.yaml` に `BucketDeployment` カスタムリソースを追加して `sam deploy` と同時にアップロード

### Q2: CloudFront キャッシュ無効化
フロントエンド更新時の CloudFront キャッシュ無効化（Invalidation）は必要ですか？

[Answer]:  
- A: 毎デプロイ後に `aws cloudfront create-invalidation --paths "/*"` を手動実行  
- B: `template.yaml` の BucketDeployment に自動無効化を組み込む  
- C: 不要（ハッカソン期間中はキャッシュTTLが短い or 直接 S3 URL を使用）

### Q3: facesjs.min.js の配置先
facesjs.min.js は現在 `prototype/frontend/facesjs.min.js` にあります。本番実装では以下どちらに配置しますか？

[Answer]:  
- A: `frontend/` ディレクトリに配置（S3 にアップロード）  
- B: `facesjs-fork/dist-bundle/facesjs.min.js` をビルドして `frontend/` にコピー
