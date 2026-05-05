# U0 テックスタック決定記録

> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## バックエンド テックスタック

### Lambda ランタイム

| 項目 | 決定値 | 根拠 |
|-----|-------|------|
| ランタイム | **Python 3.12** | プロトタイプ実証済み。Bedrock / DynamoDB SDK との互換性確認済み |
| 依存関係管理 | **Lambda Layer（shared/）** | 21 Lambda 共通ライブラリを単一 Layer で管理 |
| パッケージング | **SAM + pip** | SAM の `PythonPipLayer` でビルド自動化 |

### Lambda 設定マトリクス

| Lambda | プロファイル | メモリ | タイムアウト | 備考 |
|-------|------------|-------|-----------|------|
| evaluate-attitude | fast | 256 MB | 10 s | Nova Lite |
| evaluate-guidance | fast | 256 MB | 10 s | Nova Lite |
| check-draft | fast | 256 MB | 10 s | Nova Lite |
| classify-incident | fast | 256 MB | 10 s | Nova Lite |
| check-apology | fast | 256 MB | 10 s | Nova Lite |
| classify-karte | fast | 256 MB | 10 s | Nova Lite |
| classify-prevention | fast | 256 MB | 10 s | Nova Lite |
| classify-follow | fast | 256 MB | 10 s | Nova Lite |
| analyze-anger | fast | 256 MB | 10 s | Nova Lite（リアルタイム）|
| detect-danger-speech | fast | 256 MB | 10 s | Nova Lite（リアルタイム）|
| generate-plan | standard | 512 MB | 30 s | Claude Haiku 4.5 |
| probe-incident | standard | 512 MB | 30 s | Claude Haiku 4.5 |
| generate-opponent | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ（Bedrock呼び出しなし）非同期パターン採用 |
| generate-story | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| generate-feedback | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| generate-prevention | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| generate-follow-mail | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| analyze-reply | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| diagnose-tendency | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| guidance-feedback | premium | 256 MB | 10 s | Claude Sonnet — trigger のみ、非同期パターン |
| save-session | non-bedrock | 256 MB | 10 s | DynamoDB のみ |
| get-karte | non-bedrock | 256 MB | 10 s | DynamoDB のみ |
| text-to-speech | non-bedrock | 256 MB | 10 s | Polly のみ |

> **注 (W-1修正)**: 上記テーブルは 23 行だが、実際の Lambda 数は **21 本**（services.md 定義）。fast 列の内部名（evaluate-attitude 等）と services.md の Lambda 名（evaluate-apology 等）の対応づけは Infrastructure Design ステージで確定する。analyze-anger と detect-danger-speech は services.md の 21 本に含まれる Lambda（游中支援）であり、business-rules.md の fast 8 本とは別途列記したため 23 行になった。機能重複はなく、実 Lambda 数は services.md の 21 本と一致する。

### AWS サービス選定

| サービス | 選定値 | 根拠 |
|---------|-------|------|
| API | **API Gateway HTTP API v2** | REST API より低コスト・高速。Cognito JWT Authorizer 対応 |
| データベース | **DynamoDB（On-Demand）** | サーバーレス・スケーラブル。シングルテーブル設計 |
| LLM 推論 | **AWS Bedrock Converse API** | マルチモデル対応。ap-northeast-1 で Nova Lite 実証済み |
| 音声合成 | **Amazon Polly Neural** | 日本語 Kazuha/Takumi。口パク（viseme）対応 |
| 音声認識 | **Amazon Transcribe Streaming** | リアルタイムストリーミング WebSocket |
| 認証 | **Amazon Cognito User Pool + Identity Pool** | JWT 発行・Transcribe WebSocket STS 認証 |
| フロントエンド配信 | **S3 + CloudFront** | SPA 配信。CDN キャッシュ。Response Headers Policy |
| インフラ管理 | **AWS SAM** | プロトタイプ実証済み。IaC テンプレート |
| ログ | **Amazon CloudWatch Logs** | Lambda / API Gateway 構造化ログ。保持期間 7日 |

---

## フロントエンド テックスタック

| 項目 | 決定値 | 根拠 |
|-----|-------|------|
| 実装方式 | **Vanilla JavaScript（マルチページ）** | ビルドツール不要。CDN から JS 配信。デプロイ簡素化 |
| アバター | **facesjs v5.0.3（fork版）** | 200感情/15カテゴリ対応のカスタムfork。SVG即時描画 |
| CSS | **Vanilla CSS（class-based）** | CSS Custom Properties で感情アニメーション制御 |
| モジュール | **ES Modules（ブラウザネイティブ）** | バンドラー不要。`type="module"` でファイル分割 |
| 状態管理 | **StateManager（カスタム実装）** | 3層ステート（window.AppState / sessionStorage / DynamoDB） |
| HTTP クライアント | **Fetch API + ApiClient（カスタム実装）** | 外部ライブラリ不要。JWT 自動リフレッシュ込み |
| 認証 | **AuthModule（カスタム実装）** | Cognito Hosted UI + PKCE フロー |

---

## テストテックスタック

| 対象 | フレームワーク | 用途 |
|-----|------------|------|
| Python Lambda（単体） | **pytest** | 単体テスト |
| Python Lambda（PBT） | **Hypothesis** | プロパティベーステスト（input_validator.py） |
| JavaScript（単体） | **Vitest** | モジュール単体テスト（facesjs fork 既存設定を活用） |
| JavaScript（PBT） | **fast-check** | プロパティベーステスト（EmotionDefinitions） |
| E2E | 手動テスト（デプロイ後） | API 統合テスト・UX 確認 |

---

## リージョン・エンドポイント設定

| サービス | リージョン | 根拠 |
|---------|----------|------|
| Lambda / API Gateway / DynamoDB / S3 / CloudFront | **ap-northeast-1** | ユーザー（日本）に近い。全サービス提供済み |
| Bedrock（Nova Lite / Haiku 4.5 / Sonnet） | **ap-northeast-1** | プロトタイプで実証済み（cfn-template.yaml）。要デプロイ前確認 |
| Polly / Transcribe | **ap-northeast-1** | 日本語音声サービス対応済み |
| Cognito | **ap-northeast-1** | Lambda と同一リージョン |

> **⚠️ 要確認**: Claude Haiku 4.5 / Sonnet 4.5 の `ap-northeast-1` 利用可否はデプロイ前に Bedrock コンソールで確認すること。  
> 不可の場合は `us-east-1` または `us-west-2` へのクロスリージョン呼び出しを検討（追加レイテンシ 50-100ms）。

---

## コスト見積もり（ハッカソンデモ 100セッション想定）

| サービス | 見積もり | 備考 |
|---------|---------|------|
| Bedrock（Nova Lite × 8 fast calls/session） | ~$0.01/session | 入力1Kトークン×8×$0.00006 + 出力0.5K×8×$0.00024 |
| Bedrock（Haiku 4.5 × 2 calls/session） | ~$0.01/session | 入力1K×2×$0.00025 + 出力0.5K×2×$0.00125 |
| Bedrock（Sonnet × 3 calls/session） | ~$0.05/session | 入力1K×3×$0.003 + 出力0.5K×3×$0.015（**⚠️ W-3**: Claude Sonnet 4.5 の Bedrock 料金は変動する可能性あり。デプロイ前に [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/) で最終確認すること） |
| Lambda（21本 × 10呼/session） | ~$0.00/session | 無料枠内（月100万リクエスト） |
| API Gateway | ~$0.00/session | 無料枠内（月100万API呼び出し） |
| DynamoDB | ~$0.00/session | 無料枠内（月100万書き込み） |
| CloudWatch Logs（7日保持） | ~$0.01/session | 1GB × $0.033 |
| **合計** | **~$0.07〜$0.15/session** | |
| **100セッション合計** | **~$7〜$15** | ハッカソン予算内（$50以内 ✅） |
