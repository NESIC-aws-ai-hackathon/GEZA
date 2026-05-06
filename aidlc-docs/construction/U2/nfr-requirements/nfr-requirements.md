# U2 非機能要件（NFR Requirements）
> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-05  
> 対象ユニット: U2（コンシェルジュコア）  
> ステータス: 承認待ち

---

## 前提・継承事項

U0 で確定した NFR（Lambda タイムアウト / メモリ / API GW スロットリング / DynamoDB / CloudWatch Logs）を U2 にそのまま適用する（Q1: A）。本書では U2 固有の追加要件のみ定義する。

---

## 1. パフォーマンス要件

### 1.1 U2 Lambda 設定（U0 NFR 既定値適用）

| Lambda | プロファイル | タイムアウト | メモリ | LLM |
|--------|------------|-----------|------|-----|
| `assess-apology` | fast | **10s** | **256 MB** | Nova Lite |
| `probe-incident` | standard | **30s** | **512 MB** | Claude Haiku 4.5 |
| `generate-opponent` | standard | **30s** | **512 MB** | Claude Haiku 4.5 |
| `generate-plan`（trigger） | fast | **10s** | **256 MB** | なし（SQS送信のみ） |
| `generate-plan`（bedrock-dispatcher経由） | premium | **29s** | **1024 MB** | Claude Sonnet |

> `generate-plan` は SQS 非同期パターン。trigger Lambda は jobId を即時返却（10s）。Bedrock 処理は bedrock-dispatcher が担当（U0 実装済み）。

### 1.2 E2E レスポンスタイム目標

| シナリオ | 目標 | 備考 |
|---------|------|------|
| `assess-apology` E2E（入力→角度表示） | **3秒以内** | Nova Lite 1-3s |
| `probe-incident` 1ラウンド E2E | **10秒以内** | Haiku 4.5 5-8s + UI更新 |
| `generate-opponent` E2E | **15秒以内** | Haiku 4.5 5-15s |
| `generate-plan` submit → jobId 受取 | **3秒以内** | SQS trigger のみ（fast） |
| `generate-plan` polling 完了（Sonnet生成） | **30秒以内** | bedrock-dispatcher 経由 |
| アバターカスタマイズ再描画（リアルタイム） | **100ms以内** | facesjs は軽量（DOM 再描画のみ） |

### 1.3 SQS polling 仕様（U0 NFR Design 準拠）

```
MAX_POLL_WAIT_MS  = 60,000ms（60秒）
POLL_INTERVALS    = [1000, 2000, 4000, 5000, 5000, 5000, ...]
```

> 5s 固定後の累積: 7s + 5s × (60-7)/5 ≈ 最大60s 未満で打ち切り。

---

## 2. セキュリティ要件

### 2.1 入力バリデーション（SECURITY-08 準拠）

| フィールド | ルール | エラー時の挙動 |
|-----------|--------|--------------|
| `incident_summary` | 必須 / 最大 2000 文字 | フォームエラー表示、API 呼び出し中断 |
| probe 回答 | 必須 / 最大 500 文字（Q2: A — 空送信不可） | 送信ボタン無効化または入力必須メッセージ |
| `user_degree` | 0〜180 の整数 | 範囲外ならエラー表示 |
| `apology_date` | 今日以降の ISO8601 日付 | 過去日付は選択不可 |
| フォームフィールド全般 | XSS-01: `textContent` / `value` のみで DOM 挿入 | — |

### 2.2 XSS 対策（XSS-01）

- AI 生成テキスト（opponent_profile.first_message / apologyPlan.full_script 等）を DOM に表示する場合も `textContent` を使用
- `innerHTML` 使用禁止（facesjs SVG 挿入は信頼済みライブラリのため例外）

### 2.3 プロンプトインジェクション対策（SECURITY-08 準拠）

- `incident_summary` / probe 回答 に対して backend/shared/input_validator.py でブロックリスト検査 + 文字数制限を実施（U0 実装済み）
- Lambda の `@validate_input` デコレータで全 Lambda に適用済み

### 2.4 認証ガード（AUTH-05）

- `inception.html` の DOMContentLoaded で `AuthModule.requireAuth()` を必ず呼び出す
- 未認証時は `index.html` へリダイレクト

### 2.5 セキュリティコンプライアンスマトリクス（U2 関連）

| ID | 要件 | U2 対応 |
|----|-----|---------|
| SECURITY-01 | HTTPS強制 | ✅ CloudFront（U0設定済み） |
| SECURITY-02 | JWT認証 | ✅ API GW Cognito Authorizer（U0設定済み） |
| SECURITY-03 | CORS制限 | ✅ API GW CORS設定（U0設定済み） |
| SECURITY-04 | セキュリティヘッダー | ✅ CloudFront ResponseHeadersPolicy（U0設定済み） |
| SECURITY-05 | DynamoDB暗号化 | ✅ SSE-DynamoDB（U0設定済み） |
| SECURITY-06 | IAM最小権限 | ✅ Lambda別IAMポリシー（U0設定済み） |
| SECURITY-07 | ログ管理 | ✅ CloudWatch 7日保持（U0設定済み） |
| SECURITY-08 | 入力バリデーション | ✅ input_validator.py（U0実装済み）+ U2フォームバリデーション追加 |
| SECURITY-09 | XSS対策 | ✅ textContent使用・innerHTML禁止（コードレビューで確認） |

---

## 3. 信頼性要件

### 3.1 エラー回復方針（Q10: A）

| エラー種別 | フロントエンド対応 |
|-----------|--------------|
| Bedrock 呼び出しエラー | Lambda 内で指数バックオフ 3回リトライ後エラーを返す（U0 bedrock_client.py 実装済み） |
| generate-plan ポーリングタイムアウト（60s超過） | 「台本の生成に時間がかかっています。もう一度試してください」+ 「もう一度試す」ボタン |
| generate-opponent 失敗 | 「相手の生成に失敗しました」+ 「もう一度試す」ボタン |
| probe-incident 失敗 | 「深掘り分析でエラーが発生しました。スキップして進めることができます」+ スキップボタン |
| save-session 失敗 | 「保存に失敗しました。接続を確認してください」（再試行可） |
| ネットワーク断絶 | グローバルバナー「接続を確認してください」 |

### 3.2 再生成制限

- `generate-opponent` 再生成は最大 3 回。4回目以降はボタンをグレーアウト

### 3.3 データ保存タイミング（Q4: B）

- **Step 5 完了時（プラン生成完了時）に自動 save-session**（incident / opponent / plan を保存）
- **Step 6 で apology_date を追加保存**（PATCH 相当: sessionId 指定で上書き）

---

## 4. 運用要件

### 4.1 ログ（U0 既定値継承）

- Lambda ログ: CloudWatch Logs / 7日保持
- エラーログ: `structured_logger.py` の `error_log()` を使用（U0 実装済み）

### 4.2 アバターカスタマイズ描画（Q3: A — リアルタイム）

- プリセット変更・スライダー操作のたびに `facesjs.display()` を即時呼び出す
- facesjs は軽量（ピュア SVG 生成, DOM re-render のみ）のため 100ms 以内を保証

---

## 5. PBT（プロパティベーステスト）コンプライアンス

U0 で定義した PBT ターゲットを U2 範囲で確認・追加:

| テスト対象 | プロパティ | 追加 |
|-----------|----------|:----:|
| `input_validator.py` invariant（U0） | 全入力に対して注入文字を含む場合は必ず拒否 | ✅ U0実装済み |
| `EmotionDefinitions.pickRandomInCategory()` invariant（U0） | 返り値が常に指定カテゴリ内の感情 | ✅ U0実装済み |
| `assess-apology` プロパティ | 出力の `ai_degree` は常に 0〜180 の整数 | U2 Code Generation で追加 |
| `probe-incident` プロパティ | `round` は常に 1〜5 の範囲内。`status` は `"probing"` または `"completed"` のみ | U2 Code Generation で追加 |
