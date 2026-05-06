# U2 技術スタック決定（Tech Stack Decisions）
> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-05  
> 対象ユニット: U2（コンシェルジュコア）  
> ステータス: 承認待ち

---

## 1. Lambda 設定マトリクス（U2 対象 4本）

| # | Lambda 名 | Handler | プロファイル | タイムアウト | メモリ | LLM | SQS |
|---|-----------|---------|------------|-----------|------|-----|:---:|
| 1 | `assess-apology` | assess_apology.lambda_handler | fast | 10s | 256 MB | Nova Lite | — |
| 2 | `probe-incident` | probe_incident.lambda_handler | standard | 30s | 512 MB | Claude Haiku 4.5 | — |
| 3 | `generate-opponent` | generate_opponent.lambda_handler | standard | 30s | 512 MB | Claude Haiku 4.5 | — |
| 4 | `generate-plan`（trigger） | generate_plan.lambda_handler | fast | 10s | 256 MB | なし | 送信側 |

> `generate-plan` の Bedrock 処理は U0 実装済みの `bedrock-dispatcher` Lambda（premium / 29s / 1024MB）が担当。

---

## 2. フロントエンド技術スタック（U2 追加分）

| 要素 | 採用技術 | 根拠 |
|-----|---------|------|
| ページ制御 | Vanilla JS（`inception.js`） | U1 パターン踏襲 |
| ApologyMeter | `apology-meter.js`（prototype 移植） | 既存演出資産を流用 |
| QR コード表示 | `qrcode.min.js`（既存 frontend/assets/） | U1 MFA_SETUP で使用済み |
| アバターカスタマイズ | `facesjs.override()` + プリセット定義 | facesjs 公式 API |
| accordion UI | CSS `details/summary` ネイティブ要素 | フレームワーク不要・軽量 |
| 日付ピッカー | `<input type="date">` ネイティブ | モバイル対応済み |
| StateManager | `shared/state.js`（U0 実装済み） | inception ネームスペース追加のみ |

---

## 3. バックエンド技術スタック（U2 Lambda 共通）

| 要素 | 採用技術 | 根拠 |
|-----|---------|------|
| ランタイム | Python 3.12 / arm64（Graviton2） | U0 Globals 設定継承 |
| 共有ライブラリ | `backend/shared/`（decorators / input_validator / bedrock_client / prompt_loader / structured_logger） | U0 実装済み |
| Bedrock リージョン | `ap-northeast-1` | U0 NFR Design で確定 |
| Nova Lite モデル ID | `amazon.nova-lite-v1:0` | U0 確定 |
| Claude Haiku 4.5 モデル ID | `anthropic.claude-haiku-4-5` | U0 確定（ap-northeast-1 利用可否はデプロイ前確認要） |
| Claude Sonnet モデル ID | `anthropic.claude-sonnet-4-5` | U0 確定（ap-northeast-1 利用可否はデプロイ前確認要） |

---

## 4. データフロー（U2 固有）

```
[FE] inception.js
  │
  ├─ POST /apology/assess   → assess-apology (Nova Lite)
  │                           → AssessmentResult を StateManager に保存
  │
  ├─ POST /incident/probe   → probe-incident (Haiku 4.5) × 2〜5回
  │                           → enrichedSummary を StateManager に保存
  │
  ├─ POST /opponent/generate → generate-opponent (Haiku 4.5)
  │                           → OpponentProfile + avatar_seed を StateManager に保存
  │                           → facesjs.generate({seed}) でアバター生成
  │
  ├─ POST /plan/generate    → generate-plan trigger (fast)
  │     └─ jobId 受取       → SQS → bedrock-dispatcher (Sonnet)
  │     └─ GET /job/{jobId} → polling（指数バックオフ）
  │                           → ApologyPlan を StateManager に保存
  │
  ├─ POST /sessions         → save-session (非Bedrock / Step5完了時)
  │                           → sessionId を StateManager に保存
  │
  └─ POST /sessions (PATCH) → save-session (apology_date 追加 / Step6)
```

---

## 5. コスト見積もり（ハッカソン期間想定）

| 項目 | 想定呼び出し回数 | 概算コスト |
|-----|---------------|---------|
| Nova Lite（assess-apology） | 〜200回 | < $0.01 |
| Haiku 4.5（probe-incident × 3ラウンド） | 〜600回 | < $0.10 |
| Haiku 4.5（generate-opponent） | 〜200回 | < $0.05 |
| Sonnet（generate-plan via bedrock-dispatcher） | 〜200回 | < $1.00 |
| DynamoDB（save-session） | 〜200回 | < $0.01 |
| **合計** | | **< $1.20** |

> 大会デモ（最大50名）を想定。Sonnet は高コストだが回数が少ないため許容範囲内。
