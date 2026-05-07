# U3 非機能要件（NFR Requirements）
> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-07  
> 対象ユニット: U3（リハーサルモード）  
> ステータス: 承認待ち

---

## 前提・継承事項

U0 で確定した NFR（Lambda タイムアウト / メモリ / API GW スロットリング / DynamoDB / CloudWatch Logs 7日保持）を U3 にそのまま適用する（Q1: A）。本書では U3 固有の追加要件のみ定義する。

---

## 1. パフォーマンス要件

### 1.1 U3 Lambda 設定（U0 NFR 既定値適用）

| Lambda | プロファイル | タイムアウト | メモリ | LLM |
|--------|------------|-----------|------|-----|
| `evaluate-apology` | fast | **10s** | **256 MB** | Nova Lite |
| `text-to-speech` | fast | **10s** | **256 MB** | なし（Polly のみ） |
| `generate-feedback` | premium（同期） | **29s** | **1024 MB** | Claude Sonnet |

> `generate-feedback` は SQS 非同期ではなく**同期呼び出し**（レスポンスが遅い場合はローディング表示維持）。  
> セッションは 1回のみ呼び出しのため UI への影響は許容範囲内。

### 1.2 E2E レスポンスタイム目標

| シナリオ | 目標 | 備考 |
|---------|------|------|
| `evaluate-apology` E2E（入力→AI返答表示） | **5秒以内** | Nova Lite 1〜3s + Polly TTS + UI更新 |
| `text-to-speech` E2E（テキスト→音声再生開始） | **3秒以内** | Polly Neural 0.5〜1.5s |
| `generate-feedback` E2E（遷移→フィードバック表示） | **15秒以内** | Sonnet 5〜12s |
| Transcribe Streaming 文字起こし遅延 | **3秒以内** | リアルタイムストリーミング |
| AvatarController 感情切り替え | **500ms以内** | CSS transition 200ms + setCategory 処理 |

### 1.3 Transcribe Streaming 仕様

```
無音検出タイムアウト: 3秒（Q2: A）
サンプルレート: 16,000 Hz
エンコーディング: PCM
言語コード: ja-JP
接続方式: SigV4 署名 WebSocket（フロントエンド直接）
最大録音時間: 60秒（過剰録音防止のためのハードリミット）
```

### 1.4 最大ターン数

| 設定 | 値 | 挙動 |
|-----|---|------|
| `MAX_TURNS` | **10** | 10ターン到達時に「セッションが長くなりました。フィードバックを確認しましょう」バナーを表示し、入力エリアを無効化 → フィードバックへ誘導 |

---

## 2. セキュリティ要件

### 2.1 入力バリデーション（SECURITY-08 準拠）

| フィールド | ルール | エラー時の挙動 |
|-----------|--------|--------------|
| `apology_text` | 必須 / 最大 2000 文字 / 空文字送信不可 | 送信ボタン disabled |
| `opponent_profile` | sessionStorage から読み取り（Lambda 側で必須チェック） | 不正値は Lambda で 400 返却 |
| `text`（TTS） | 最大 3000 文字（Polly Neural 上限） | Lambda 側でトリム警告 |
| `conversation_history` | 直近 10 ターン上限（フロントエンドでスライス） | 超過分を自動除外 |

### 2.2 Cognito Identity Pool（Transcribe 用）

| 設定 | 値 |
|-----|---|
| `AllowUnauthenticatedIdentities` | **false**（認証済みユーザーのみ / Q6: A） |
| 認証済みロール権限 | `transcribe:StartStreamTranscription` のみ（最小権限） |
| フェデレーションプロバイダー | GezaUserPool（同一スタック内の User Pool） |

### 2.3 XSS 対策（SECURITY-05 / XSS-01）

- AI 生成テキスト（`response_text` / `problems` / `improved_apology_text` / `follow_up_question`）はすべて `textContent` で挿入
- Transcribe の文字起こし結果も `textContent` で表示
- `innerHTML` は一切使用しない

### 2.4 音声データプライバシー（PRIVACY-01）

- Transcribe へ送信した音声は Lambda / DynamoDB に保存しない
- Polly TTS 用テキスト（`response_text`）は Lambda 側で Polly に送信するのみ（S3 保存なし）

---

## 3. ユーザビリティ要件

### 3.1 ブラウザ対応（U1 NFR 継承）

| ブラウザ | 対応 | 備考 |
|---------|:---:|------|
| Chrome 最新版 | ✅ | デモメイン環境 |
| Safari 最新版（iOS/macOS） | ✅ | iPhone デモ対応 |
| Firefox | — | ハッカソンスコープ外 |

> **Safari 注意事項**:  
> - `getUserMedia` は HTTPS 必須 → CloudFront 経由のため問題なし  
> - `MediaRecorder` の mimeType は Safari では `audio/mp4` のみ対応 → PCM への変換が必要（AudioContext + ScriptProcessorNode）

### 3.2 操作フロー NFR

| 要件 | 仕様 |
|-----|------|
| 発話中の入力 | Polly 再生完了まで送信ボタンを disabled（Q3: B） |
| 音声入力中 | マイクボタンが「録音中」UIに変化（赤点滅）。送信ボタン disabled |
| ローディング中 | アバター表情を `confusion` カテゴリに変更し「考え中」を表現 |
| フィードバック生成中 | ローディングスピナー表示（generate-feedback は最大 15 秒） |

---

## 4. 信頼性要件

### 4.1 フォールバック仕様（US-408）

```
consecutiveErrors = 0 で初期化
evaluate-apology 呼び出し失敗時:
  if consecutiveErrors < 2:
    - 固定返答テキストを表示: "少し考えさせてください…"
    - emotion_label = "confusion"（アバター表情）
    - anger_level / trust_level は前ターンの値を維持
    - consecutiveErrors += 1
  else:
    - エラーバナー「通信エラーが発生しています。少し時間をおいてから再試行してください」を表示
    - 送信ボタン / マイクボタンを disabled
    - 「もう一度試す」ボタンを表示（クリックで consecutiveErrors = 0 にリセット + enabled）

成功時:
  - consecutiveErrors = 0 にリセット
```

### 4.2 Transcribe 接続エラー時

```
WebSocket 接続失敗 / 切断:
  - マイクボタンを非活性化し「音声入力が利用できません」メッセージを表示
  - テキスト入力は引き続き利用可能
```

---

## 5. テスト要件

### 5.1 PBT（Property-Based Testing）対象

| 対象 | テストライブラリ | プロパティ |
|-----|--------------|---------|
| `evaluate-apology` Lambda の入力バリデーション | Hypothesis (Python) | 任意の文字列 apology_text に対して `input_validator.validate()` が適切な 400 / 200 を返すこと |
| `text-to-speech` Lambda | Hypothesis (Python) | 空文字 / 3000文字超 / 特殊文字を含む text に対して Lambda が 400 を返すか Polly に渡す前にブロックすること |

### 5.2 スモークテスト要件

| テスト | 期待値 |
|-------|-------|
| `POST /apology/evaluate`（JWT なし） | HTTP 401 |
| `practice.html`（CloudFront 経由） | HTTP 200 |
| `feedback.html`（CloudFront 経由） | HTTP 200 |
| `transcribe.js`（CloudFront 経由） | HTTP 200 |
| `polly-sync.js`（CloudFront 経由） | HTTP 200 |
| `POST /tts/synthesize`（JWT なし） | HTTP 401 |

---

## 6. セキュリティコンプライアンスサマリー

| ID | 要件 | U3 対応状況 |
|---|------|------------|
| SECURITY-01 | Cognito JWT 認証必須 | requireAuth() を practice.js / feedback.js 先頭で呼び出し ✅ |
| SECURITY-04 | HTTP セキュリティヘッダー | CloudFront Response Headers Policy（U0 設定済み）✅ |
| SECURITY-05 | XSS 対策（innerHTML 禁止） | 全テキスト挿入を textContent で実施 ✅ |
| SECURITY-08 | 入力バリデーション | evaluate-apology / text-to-speech Lambda で input_validator.validate() 適用 ✅ |
| SECURITY-09 | プロンプトインジェクション対策 | INJECTION_PATTERNS によるブラックリストチェック ✅ |
| PRIVACY-01 | 音声データ非保存 | Transcribe 音声・Polly テキストを永続化しない ✅ |

---

## PBT コンプライアンス

| ID | 要件 | 対応 |
|---|------|-----|
| PBT-01 | 主要入力パスに Hypothesis / fast-check テストを追加 | evaluate-apology / text-to-speech の入力バリデーション invariant を追加 ✅ |
