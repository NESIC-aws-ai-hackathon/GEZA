# U3 技術スタック決定（Tech Stack Decisions）
> AI-DLC CONSTRUCTION Phase — NFR Requirements  
> 生成日: 2026-05-07  
> 対象ユニット: U3（リハーサルモード）  
> ステータス: 承認待ち

---

## 1. Lambda 設定マトリクス（U3 対象 3本）

| # | Lambda 名 | Handler | プロファイル | タイムアウト | メモリ | LLM | 備考 |
|---|-----------|---------|------------|-----------|------|-----|------|
| 1 | `evaluate-apology` | evaluate_apology.lambda_handler | fast | 10s | 256 MB | Nova Lite | 同期呼び出し |
| 2 | `text-to-speech` | text_to_speech.lambda_handler | fast | 10s | 256 MB | なし（Polly のみ） | 同期呼び出し |
| 3 | `generate-feedback` | generate_feedback.lambda_handler | premium（同期） | 29s | 1024 MB | Claude Sonnet | 同期呼び出し（SQS 非同期なし） |

---

## 2. フロントエンド技術スタック（U3 追加分）

| 要素 | 採用技術 | 根拠 |
|-----|---------|------|
| 音声入力 | `getUserMedia` + `MediaRecorder` / `AudioContext` | Safari の `audio/mp4` 対応のため AudioContext でリサンプリング |
| Transcribe 接続 | SigV4 署名 WebSocket（フロントエンド直接） | リアルタイム低遅延。Lambda 経由なし |
| Transcribe 認証情報 | Cognito Identity Pool → 一時クレデンシャル | `GetCredentialsForIdentity` API |
| Polly 音声再生 | HTML `<audio>` 要素 + `URL.createObjectURL` | Base64 → Blob URL 変換 |
| Viseme 同期 | `setTimeout` タイムコード制御 | PollySyncController で実装 |
| チャット UI | `<div>` + `textContent` 追加 | XSS-01 準拠 |
| ゲージ | CSS `width` プロパティアニメーション | CSS transition で滑らか更新 |
| StateManager | `shared/state.js`（U0 実装済み） | practice ネームスペースを追加 |
| AvatarController | `shared/avatar.js`（U0 実装済み） | setCategoryEmotion() を呼び出し |
| PollySyncController | `shared/polly-sync.js`（U3 新規） | playWithSync() を実装 |
| TranscribeClient | `shared/transcribe.js`（U3 新規） | startStreaming() を実装 |

---

## 3. バックエンド技術スタック（U3 Lambda 共通）

| 要素 | 採用技術 | 根拠 |
|-----|---------|------|
| ランタイム | Python 3.12 / arm64（Graviton2） | U0 Globals 設定継承 |
| 共有ライブラリ | `backend/shared/`（全 5 モジュール） | U0 実装済み |
| Nova Lite モデル ID | `amazon.nova-lite-v1:0` | U0 確定 |
| Claude Sonnet モデル ID | `anthropic.claude-sonnet-4-5` | U0 確定（ap-northeast-1 利用可否はデプロイ前確認要） |
| Polly Voice | Kazuha（女性, ja-JP, Neural）/ Takumi（男性, ja-JP, Neural） | プロトタイプで実証済み |
| Polly SpeechMarks | `viseme` タイプ指定 | 口パク同期に必要 |

---

## 4. インフラ追加（U3 固有）

| リソース | 種別 | 目的 |
|---------|-----|------|
| `GezaIdentityPool` | `AWS::Cognito::IdentityPool` | Transcribe Streaming 用フェデレーション認証 |
| `GezaAuthenticatedRole` | `AWS::IAM::Role` | Identity Pool の認証済みロール（transcribe 権限付与） |
| `GezaIdentityPoolRoleAttachment` | `AWS::Cognito::IdentityPoolRoleAttachment` | IdentityPool ↔ Role の紐付け |

> **既存リソースへの変更なし**。template.yaml に上記 3 リソースを追加するのみ。

---

## 5. データフロー（U3 固有）

```
[FE] practice.js
  │
  ├─ sessionStorage["opponentProfile"] 読み取り
  ├─ sessionStorage["apologyPlan"] 読み取り（台本表示用）
  │
  ├─ [練習開始ボタン押下]
  │   └─ POST /tts/synthesize（first_message を音声化）
  │       └─ PollySyncController.playWithSync(audioBase64, visemes)
  │
  ├─ [テキスト送信 or 音声送信]
  │   ├─ [音声入力の場合] TranscribeClient.startStreaming()
  │   │                   → WebSocket → Transcribe → final transcript
  │   │
  │   ├─ POST /apology/evaluate（同期 / Nova Lite fast 10s）
  │   │   → { emotion_label, response_text, anger_level, trust_level, ng_words, follow_up_question }
  │   │
  │   ├─ AvatarController.setCategoryEmotion(emotion_label)
  │   ├─ ゲージ更新（CSS animation）
  │   ├─ チャット追加（textContent）
  │   └─ POST /tts/synthesize（response_text）
  │       └─ PollySyncController.playWithSync()
  │
  ├─ [クリア判定 or 手動終了]
  │   └─ sessionStorage["practiceResult"] に FeedbackData 保存
  │   └─ feedback.html へ遷移
  │
  └─ [feedback.html]
      └─ POST /feedback/generate（同期 / Sonnet premium 29s）
          → { problems, improved_apology_text, overall_comment }
```

---

## 6. コスト見積もり（ハッカソン期間想定）

| 項目 | 想定呼び出し回数 | 概算コスト |
|-----|---------------|---------|
| Nova Lite（evaluate-apology, 10ターン/セッション） | 〜1,000回 | < $0.05 |
| Polly Neural（text-to-speech, 10ターン/セッション） | 〜1,000回 | < $0.10 |
| Transcribe Streaming（〜30秒/ターン） | 〜500分 | < $0.50 |
| Sonnet（generate-feedback, 1回/セッション） | 〜100回 | < $0.50 |
| **合計** | | **< $1.20** |

> 大会デモ（最大50名・各2セッション想定）。Transcribe はストリーミング料金（$0.024/分）が主なコスト。
