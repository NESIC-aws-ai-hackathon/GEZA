# U0 NFR Requirements 計画

> AI-DLC CONSTRUCTION Phase — NFR Requirements（Part 1: 計画）  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）  
> 作成日: 2026-05-05

---

## 実行チェックリスト

- [x] Step 1: Functional Design 成果物のレビュー
- [x] Step 2: NFR 評価計画の作成
- [x] Step 3: ユーザー確認事項の生成
- [x] Step 4: 計画ファイルの保存（このファイル）
- [x] Step 5: 回答収集・曖昧性確認
- [x] Step 6: NFR Requirements 成果物生成
- [x] Step 7: 完了メッセージ提示

---

## Functional Design レビュー概要

U0 の Functional Design から抽出した NFR に関連する主要ポイント：

| 領域 | 確認事項 |
|-----|---------|
| Lambda リトライ | 指数バックオフ 3回（1s/2s/4s） — タイムアウト設定への影響 |
| DynamoDB | SSE-DynamoDB 暗号化 / PITRなし — パフォーマンス特性 |
| API Gateway | スロットリング 100req/s — 想定負荷との整合性 |
| フロントエンド | sessionStorage / JWT リフレッシュ — レイテンシ要件 |
| Bedrock 呼び出し | ap-northeast-1 / max_tokens=2048 — タイムアウト設定 |
| SAM テンプレート | Lambda 512MB / 30秒タイムアウト — 不足の可能性確認 |

---

## 確認事項（Q1〜Q10）

このファイルの `[Answer]:` タグに回答を記入してください。  
**回答形式**: A/B/C/D/E/X のいずれか（複数選択可の場合は「A, C」等で記載）

---

## Q1: Lambda タイムアウト設定

U0 の共通 Lambda（デコレーター・バリデーション・Bedrock呼び出し）について、現在 30 秒のタイムアウトが設定されています。  
Bedrock リトライ（最大 1+2+4=7秒待機 + API応答）を考慮したとき、タイムアウト設定はどうしますか？

A) 30秒のまま（Bedrock premium = Sonnet は 20〜30秒かかる可能性があるため妥当）  
B) 60秒に延長（余裕を持たせる）  
C) Lambdaごとに個別設定（fast=10s / standard=30s / premium=60s）  
D) 現状の 30秒で実測後に調整（実装後に変更）  
X) その他（[Answer]タグ後に記述）

[Answer]: C

---

## Q2: Lambda メモリサイズ設定

現在全 Lambda を 512 MB で統一する計画です。  
U0 の共通ライブラリ（Python Lambda Layer）を含む全 Lambda でこのサイズは適切ですか？

A) 512MB で全統一（シンプルさを優先）  
B) 役割ごとに最適化（fast: 256MB / standard: 512MB / premium: 1024MB）  
C) 256MB に下げてコスト削減（ハッカソンスコープで十分）  
D) 1024MB に上げてコールドスタートを短縮する  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

## Q3: Lambda コールドスタート許容値

謝罪中支援（analyze-anger / detect-danger-speech）はリアルタイム性が重要です。  
コールドスタートのレイテンシ（300〜800ms程度）はどの程度許容しますか？

A) 許容する（ハッカソンデモなので問題ない）  
B) Provisioned Concurrency を使用（常時ウォーム状態を維持）  
C) 定期的なウォームアップ Lambda（5分ごとにダミー呼び出し）を実装  
D) コールドスタートが問題になったら対処（実装後判断）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q4: フロントエンドのパフォーマンス目標

ユーザーが謝罪評価（POST /apology/assess）ボタンを押してから結果表示まで、どの程度を目標にしますか？

A) 3秒以内（E2E: FE→API→Lambda→Bedrock→FE）  
B) 5秒以内（Sonnet使用の場合は現実的な上限）  
C) 10秒以内（タイムアウト閾値として設定）  
D) 数値目標は設けない（UX上はローディング表示で対処）  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

## Q5: DynamoDB プロビジョニングモード

現在 On-Demand（PAY_PER_REQUEST）モードを想定しています。  
ハッカソンのデモ用途では適切ですか？

A) On-Demand のまま（デモ・検証フェーズは PAY_PER_REQUEST が最適）  
B) Provisioned（5RCU/5WCU）に変更してコスト予測を安定させる  
C) On-Demand で構築し、コスト超過時は Provisioned に切り替え  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q6: CloudWatch Logs 保持期間

Lambda・API Gateway のログ保持期間をどう設定しますか？

A) 1週間（7日）でコスト最小化  
B) 1ヶ月（30日）  
C) 3ヶ月（90日）  
D) 無制限（AWSデフォルト）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q7: フロントエンドのバンドル・ロード時間目標

Vanilla JS + facesjs（SVGアバター）を含むフロントエンドの初期ロード時間についての目標はありますか？

A) 3秒以内（3G回線でも快適に動作）  
B) 5秒以内（Wi-Fi/LTEを前提）  
C) 特に目標なし（デモ環境なのでロード時間は問題としない）  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

## Q8: S3 + CloudFront の可用性要件

フロントエンドを配信する S3 + CloudFront の可用性についての要件はありますか？

A) AWS マネージドの可用性に依存（SLA 99.9%以上で十分）  
B) CloudFront のキャッシュで S3 障害時も継続配信できれば十分  
C) 特に要件なし（ハッカソンデモなので可用性は優先度低）  
X) その他（[Answer]タグ後に記述）

[Answer]: C

---

## Q9: API Gateway のスロットリング設定

現在 バースト=500 / レート=100 req/s を想定しています。  
ハッカソン本番（デモ発表時の同時アクセス）を考慮したとき、この設定は適切ですか？

A) このまま（デモ発表での同時アクセスは数名〜十数名程度）  
B) より低く設定してコスト保護（バースト=100 / レート=20）  
C) デプロイ後に実際の負荷を見て調整  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

## Q10: エラー監視・アラートの要件

本番稼働時のエラー監視について、どのレベルまで対応しますか？

A) CloudWatch Logs のみ（手動確認、アラートなし）  
B) CloudWatch Alarm を設定（Lambda エラー率が一定閾値超えたらメール通知）  
C) CloudWatch Dashboard を構築（リアルタイムで監視できる可視化）  
D) 特に不要（ハッカソンデモ期間のみ稼働）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## 確認事項の提出方法

上記 Q1〜Q10 の `[Answer]:` タグの後に回答（A/B/C/D/E/X）を記入してチャットに貼り付けてください。  
このファイルを直接編集して内容を送ってもかまいません。

回答受領後、NFR Requirements 成果物（nfr-requirements.md / tech-stack-decisions.md）を生成します。
