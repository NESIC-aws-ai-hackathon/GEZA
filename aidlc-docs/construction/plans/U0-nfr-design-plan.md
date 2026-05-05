# U0 NFR Design 計画

> AI-DLC CONSTRUCTION Phase — NFR Design（Part 1: 計画）  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）  
> 作成日: 2026-05-05

---

## 実行チェックリスト

- [x] Step 1: NFR Requirements 成果物のレビュー
- [x] Step 2: NFR Design 計画の作成
- [x] Step 3: ユーザー確認事項の生成
- [x] Step 4: 計画ファイルの保存（このファイル）
- [x] Step 5: 回答収集・曖昧性確認
- [x] Step 6: NFR Design 成果物生成
- [x] Step 7: 完了メッセージ提示

---

## NFR Requirements レビュー概要

| 重要決定事項 | 内容 |
|-----------|------|
| 非同期パターン確定 | premium Lambda（Sonnet × 8本）は API GW 29s 制限対応のため非同期化必須 |
| タイムアウト体系 | fast=10s / standard=30s / premium（API GW側）=29s / premium（processor）=60s |
| スロットリング | burst=100 / rate=20 |
| セキュリティ | SECURITY-01〜14 全適用 |
| PBT | input_validator + EmotionDefinitions の invariant テスト必須 |

---

## 確認事項（Q1〜Q8）

このファイルの `[Answer]:` タグに回答を記入してください。

---

## Q1: 非同期パターンの実装方式

premium Lambda（Claude Sonnet 使用）の非同期処理について、どの方式を採用しますか？

A) **SQS → Lambda** — API GW が SQS にメッセージ投入 → SQS トリガーで processor Lambda 起動 → DynamoDB に結果保存 → クライアントが GET /jobs/{jobId} でポーリング  
B) **DynamoDB Streams** — trigger Lambda が DynamoDB に "PENDING" レコードを書き込み → DynamoDB Streams で processor Lambda を起動  
C) **Step Functions Express Workflows** — ステートマシンで非同期実行管理（オーバーヘッドあり）  
D) **Lambda 非同期呼び出し（InvocationType=Event）** — trigger Lambda が processor Lambda を非同期で呼び出し → jobId で DynamoDB をポーリング（SQS なしシンプル構成）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q2: ポーリングの実装方式

クライアント（フロントエンド）が非同期ジョブ結果を取得する方式はどうしますか？

A) **HTTP ポーリング** — 2秒間隔で GET /jobs/{jobId} を繰り返す（最大 30回 = 60秒）  
B) **指数バックオフポーリング** — 最初 1秒 → 2秒 → 4秒と間隔を広げる（合計最大 30秒）  
C) **WebSocket 通知** — 処理完了時に API GW WebSocket 経由でプッシュ通知（実装コスト大）  
D) **Server-Sent Events (SSE)** — Lambda が処理完了後にイベントをプッシュ（API GW HTTP API は SSE 非対応のため不可）  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

## Q3: ジョブ状態管理

非同期ジョブの状態（PENDING / PROCESSING / COMPLETED / FAILED）をどこで管理しますか？

A) **DynamoDB の同一テーブル（geza-data）** — `JOB#<jobId>` をソートキーとして追加（既存テーブル活用）  
B) **DynamoDB に専用テーブル（geza-jobs）を追加** — ジョブ管理専用テーブルを分離  
C) **ElastiCache（Redis）** — TTL 付きのインメモリストレージ（コスト増・設定複雑）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q4: 回路遮断器（サーキットブレーカー）パターン

Bedrock が連続して Throttling/ServiceUnavailable を返す場合の対策はどうしますか？

A) **実装しない** — 指数バックオフリトライ（RETRY-01〜05）のみで十分（ハッカソンスコープ）  
B) **シンプルなサーキットブレーカー** — エラー率が一定閾値を超えたら一定時間 Bedrock 呼び出しをブロック  
C) **AWS Service Quotas アラーム** — CloudWatch でスロットリング率を監視し、手動対応  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q5: フロントエンドのキャッシュ戦略

CloudFront でのフロントエンドアセット（JS/CSS/SVG）のキャッシュ戦略はどうしますか？

A) **デフォルト TTL 24時間** — 静的アセットは長期キャッシュ。デプロイ時はファイル名にハッシュを含める（例: `app.abc123.js`）  
B) **TTL なし（キャッシュ無効）** — 常に最新を配信（パフォーマンス犠牲）  
C) **TTL 1時間** — バランス型  
D) **index.html: TTL 0 / 他アセット: TTL 1年** — ベストプラクティス（index.html で常に最新バージョンを参照）  
X) その他（[Answer]タグ後に記述）

[Answer]: D

---

## Q6: Lambda Layer の更新戦略

`shared/` Lambda Layer を更新した場合、21本の Lambda への反映方法はどうしますか？

A) **SAM デプロイ時に全 Lambda が自動更新** — SAM テンプレートでバージョン管理（デフォルト動作）  
B) **手動で各 Lambda の Layer バージョンを更新** — 柔軟だが手間がかかる  
C) **Lambda Power Tuning を使って Layer 更新後に性能検証** — ハッカソンスコープでは過剰  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

## Q7: DynamoDB の読み取り整合性

会話ターン（Turn）データを書き込み直後に読み取るケースがある場合、整合性をどう扱いますか？

A) **結果整合性（Eventual Consistency）** — 低コスト。書き込み直後に古いデータを返す可能性があるが許容  
B) **強整合性（ConsistentRead=True）** — 書き込み直後でも最新データを保証（RCU 2倍）  
C) **書き込み後に読み取りが必要なケースのみ ConsistentRead=True** — ケースバイケース  
X) その他（[Answer]タグ後に記述）

[Answer]: C

---

## Q8: フロントエンドのオフライン・エラー回復

API エラーやネットワーク断が発生した場合の UX 戦略はどうしますか？

A) **エラートースト表示のみ** — 「一時的なエラーが発生しました。再試行してください」を表示して手動再試行を促す  
B) **自動リトライ（最大 3回）** — 500/503 の場合は UI がバックグラウンドで自動的に再試行  
C) **エラー + 手動リトライボタン** — エラーメッセージと「再試行」ボタンを表示  
X) その他（[Answer]タグ後に記述）

[Answer]: C

---

## 確認事項の提出方法

上記 Q1〜Q8 の `[Answer]:` タグの後に回答（A/B/C/D/E/X）を記入してチャットに貼り付けてください。  
このファイルを直接編集して内容を送ってもかまいません。

回答受領後、NFR Design 成果物（nfr-design-patterns.md / logical-components.md）を生成します。
