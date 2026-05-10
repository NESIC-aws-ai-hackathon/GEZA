# U4 非機能要件（NFR Requirements）

> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-10  
> 対象ユニット: U4（謝罪後支援 + カルテ）  
> ステータス: 承認待ち

---

## U0 基盤 NFR の継承

以下の設定は U0 NFR Requirements で確定済み。U4 では変更なく継承する。

| 項目 | 設定値 | 根拠 |
|------|-------|------|
| fast Lambda タイムアウト | 10s | get-karte / analyze-karte（Nova Lite） |
| premium Lambda タイムアウト | **29s** | generate-prevention / generate-follow-mail（Claude Sonnet）— API GW ハードリミット対応 |
| fast Lambda メモリ | 256MB | get-karte / analyze-karte |
| premium Lambda メモリ | 1024MB | generate-prevention / generate-follow-mail / generate-feedback（拡張） |
| DynamoDB モード | On-Demand（PAY_PER_REQUEST） | — |
| CloudFront キャッシュ | HTML: TTL=0 / その他アセット: TTL=1年 | feedback-detail.html / carte.html も同設定（Q5=A） |
| API GW スロットリング | burst=100 / rate=20 | — |
| CloudWatch Logs 保持 | 7日 | — |

---

## 1. U4 固有 パフォーマンス要件

### 1.1 新規 Lambda のプロファイル分類

| Lambda | プロファイル | メモリ | タイムアウト | LLM |
|--------|------------|:-----:|:-----------:|-----|
| `generate-prevention` | premium | 1024MB | 29s | Claude Sonnet |
| `generate-follow-mail` | premium | 1024MB | 29s | Claude Sonnet |
| `get-karte` | fast（非 Bedrock） | 256MB | 10s | なし（DynamoDB のみ） |
| `analyze-karte` | fast | 256MB | 10s | Nova Lite |

**generate-feedback（U3 実装済み）拡張なし** — U4 で機能追加なし（戻り値は変更しない）。

### 1.2 レスポンスタイム目標（U4 固有）

| シナリオ | 目標 | 備考 |
|---------|------|------|
| generate-prevention / generate-follow-mail（同期・Q1=A） | **29秒以内**（ローディング表示維持） | Claude Sonnet: 15〜20s 想定。入力サイズ軽量（conversationHistory・problems 程度）のため U3 の generate-feedback と同等 |
| get-karte（最新50件） | **3秒以内** | DynamoDB Query のみ。50件でレスポンス 500KB 以下（Q4=B） |
| analyze-karte（Nova Lite） | **5秒以内** | Nova Lite 1〜3s。セッション数 ≥ 2 の条件チェック込み |
| save-session UPDATE（practice_result / actual_result） | **3秒以内** | DynamoDB UpdateItem のみ |

### 1.3 呼び出し方式の決定（Q1=A）

`generate-prevention` / `generate-follow-mail` は **同期呼び出し（29s）** を採用する。

**根拠**:
- 入力ペイロードが軽量（conversationHistory の一部 + problems + スコア）のため 15〜20s で完了見込み
- U3 の `generate-feedback` 同期パターンを踏襲し、実装の複雑度を下げる
- ローディング中は「AIが分析中...」スピナーを表示し UX を維持

---

## 2. キャッシュ要件

### 2.1 analyze-karte キャッシュ（Q2=B）

| 項目 | 内容 |
|------|------|
| キャッシュ先 | `sessionStorage["karteAnalysis"]` |
| 有効期間 | ブラウザセッション中 |
| 無効化タイミング | 謝罪完了記録（actual_result 保存）時に `sessionStorage.removeItem("karteAnalysis")` |
| 根拠 | 新しいセッションが追加された場合（謝罪完了）は分析結果が変わるため破棄。コスト節約（Nova Lite は安価だが不必要な呼び出しを避ける） |

### 2.2 チェックリスト状態の永続化（Q3=A）

| 項目 | 内容 |
|------|------|
| 保存先 | `localStorage["geza_checklist_{caseId}"]` |
| 形式 | `{ "fixed_0": true, "fixed_1": false, "ai_0": true, ... }` |
| DynamoDB 保存 | **なし**（MVP では不要。クロスデバイス同期はスコープ外） |
| 根拠 | チェックリストはリハーサル準備確認用。WCU 節約 + 実装シンプル化 |

---

## 3. データ量・サイズ要件

### 3.1 get-karte レスポンスサイズ（Q4=B）

| 項目 | 内容 |
|------|------|
| 最大取得件数 | **50件**（最新 updated_at 降順） |
| 推定レスポンスサイズ | 50件 × 10KB/件 = 最大 500KB |
| ページネーション | MVP では不要（50件を超えた場合は古いものは表示しない） |
| DynamoDB Limit | `Limit=50` を Query に指定 |

### 3.2 save-session UPDATE ペイロード

| フィールド | 最大サイズ |
|-----------|:--------:|
| `practice_result`（JSON string） | 1KB |
| `feedback_result`（JSON string） | 5KB（problems 最大10件 + improved_apology_text） |
| `actual_result`（JSON string） | 0.5KB（outcome + notes 500文字） |
| `actual_result.notes` | **500文字**（input_validator で制限） |

---

## 4. セキュリティ要件（U4 固有）

U0 の SECURITY-01〜14 を全継承。U4 固有の追加事項:

| ID | 対策 | 実装箇所 |
|---|------|---------|
| SEC-U4-01 | `actual_result.notes` に実名・企業名を含めないよう UI 上に注記を表示（強制ではなく推奨） | case-detail.html |
| SEC-U4-02 | generate-prevention / generate-follow-mail Lambda で `input_validator.validate()` を適用（500文字制限・インジェクション検知） | backend |
| SEC-U4-03 | get-karte は Cognito JWT の `sub` でフィルタリング（他ユーザーのカルテを取得できない） | get-karte Lambda |
| SEC-U4-04 | analyze-karte は get-karte と同じ `sub` フィルタリングを適用 | analyze-karte Lambda |
| SEC-U4-05 | `feedback_result` / `actual_result` の DynamoDB 保存は `no_html_escape: True` を適用（JSON 文字列の保全） | save-session Lambda |

---

## 5. 可用性・エラーハンドリング要件

| シナリオ | 対応 |
|---------|------|
| generate-prevention タイムアウト（29s超過） | エラーメッセージ表示 + 「再試行する」ボタン |
| generate-follow-mail タイムアウト | 同上 |
| get-karte 失敗 | エラーバナー表示（カルテ一覧ページで「取得に失敗しました」） |
| save-session UPDATE 失敗（practice_result） | Silent fail（ユーザー通知なし・CWLogs のみ） |
| save-session UPDATE 失敗（actual_result） | モーダル内エラー表示（「記録に失敗しました。再試行してください。」） |
| analyze-karte 失敗 | エラーメッセージ表示 + 「再試行する」ボタン。キャッシュは破棄しない |

---

## 6. コスト要件

### 6.1 U4 追加 Lambda のコスト概算（MVP 100ユーザー/月）

| Lambda | 想定呼び出し数/月 | 概算コスト |
|--------|:--------------:|:--------:|
| generate-prevention（Claude Sonnet, 1024MB, 20s） | 300回 | ~$0.8 |
| generate-follow-mail（Claude Sonnet, 1024MB, 20s） | 200回 | ~$0.5 |
| get-karte（DynamoDB Query, 256MB, 1s） | 500回 | ~$0.01 |
| analyze-karte（Nova Lite, 256MB, 3s） | 100回 | ~$0.05 |
| save-session UPDATE 追加呼び出し | 500回 | ~$0.01 |
| **U4 合計追加コスト** | — | **~$1.4/月** |

> U0 NFR で確定済みの基盤コスト（≈$93/月）に $1.4/月 を追加。合計 **≈$94.4/月**。

---

## 7. PBT（プロパティベーステスト）要件

U0 で確定済みの PBT ポリシーを継承。U4 で追加するプロパティ:

| 対象 | プロパティ | 検証内容 |
|------|-----------|---------|
| `get-karte` レスポンス | 件数 ≤ 50 | Limit=50 が正しく機能すること |
| `actual_result` バリデーション | `notes.length ≤ 500` かつ `outcome ∈ {"success", "partial", "failed"}` | 任意の入力に対してバリデーションが通過/失敗を正しく判定すること |

---

## セキュリティ・PBT コンプライアンスサマリー

| 観点 | 状態 | 備考 |
|------|:----:|------|
| SECURITY-01（認証 JWT） | ✅ | get-karte / analyze-karte / save-session 全て JWT Authorizer 経由 |
| SECURITY-08（入力バリデーション） | ✅ | generate-prevention / generate-follow-mail で input_validator 適用 |
| XSS-01（textContent） | ✅ | AI 生成テキスト全て textContent のみ |
| PBT-01（プロパティ記述） | ✅ | get-karte 件数制限 / actual_result バリデーション |
| コールドスタート | N/A | ハッカソンスコープで許容（U0 方針継承） |
