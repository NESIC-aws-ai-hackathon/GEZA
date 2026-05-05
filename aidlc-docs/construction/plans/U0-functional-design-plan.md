# U0 Functional Design Plan
## 共通インフラ + FEコアモジュール

> AI-DLC CONSTRUCTION Phase — Functional Design  
> 生成日: 2026-05-05  
> 対象ユニット: U0（共通インフラ + FEコアモジュール）

---

## ユニット概要

| 項目 | 内容 |
|------|------|
| ユニットID | U0 |
| ユニット名 | 共通インフラ + FEコアモジュール |
| Epic | 基盤（全Epicの前提） |
| SP | (基盤) |
| 優先度 | 最高（全ユニットの前提） |
| ユーザーストーリー | なし（技術的前提条件） |
| 依存 | なし（U0が全ての起点） |

---

## Functional Design 実行計画

- [ ] Step 1: バックエンド共通ライブラリ設計（shared-utils-layer）
- [ ] Step 2: Lambda スタブ設計（21本の統一構造）
- [ ] Step 3: フロントエンド共通モジュール設計（auth.js / api.js / state.js）
- [ ] Step 4: AvatarController 設計（avatar.js）
- [ ] Step 5: EmotionDefinitions 設計（emotions.js）
- [ ] Step 6: SAMテンプレート設計（template.yaml）
- [ ] Step 7: プロンプトテンプレートスタブ設計（prompts/*.txt）
- [ ] Step 8: 設計に関する確認事項への回答収集・曖昧性解消
- [ ] Step 9: Functional Design 成果物生成

---

## 設計上の確認事項

以下の点についてご回答ください。Functional Design の品質を高めるために必要です。

---

### Q1: shared-utils-layer の入力バリデーション方針

`input_validator.py` はすべての Lambda で共有するバリデーションユーティリティです。  
どのレベルのバリデーションを共通化しますか？

A) 最小限 — フィールド存在確認（required check）とJSON型チェックのみ共通化。詳細バリデーションは各Lambdaに任せる  
B) 標準 — フィールド存在確認 + 型チェック + 文字列長上限（デフォルト2000文字）+ プロンプトインジェクション簡易検知を共通化  
C) 詳細 — 上記に加えて、エンドポイント別スキーマ定義ファイルで各Lambdaのバリデーションルールを宣言的に管理  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

### Q2: Bedrock クライアントのエラーリトライ設計

`bedrock_client.py` のリトライ戦略はどうしますか？

A) リトライなし — Lambda タイムアウト（30s）に任せる。呼び出し元でエラー返却  
B) 指数バックオフリトライ（最大3回）— ThrottlingException / ServiceUnavailableException のみリトライ  
C) シンプル固定間隔リトライ（1秒 × 2回）— 設定をシンプルに保つ  
X) その他（[Answer]タグ後に記述）

[Answer]: B

---

### Q3: StateManager の3層ステート定義

`state.js` が管理する3層ステートの境界を明確にします。  
以下の割り当てで問題ありませんか？

```
window.AppState（リアルタイム・ページ内メモリ）:
  - currentTurn       : 現在の会話ターン番号
  - lastEmotion       : 最後にAIが返したカテゴリID
  - angerLevel        : 怒り度（0〜100）
  - trustLevel        : 信頼度（0〜100）
  - isRecording       : 音声入力中フラグ
  - isSpeaking        : Polly再生中フラグ

sessionStorage（セッション引き継ぎ）:
  - sessionId         : セッションID（DynamoDB キー）
  - bossProfile       : 謝罪相手プロフィールJSON
  - avatarSeed        : アバターシード値
  - planData          : 謝罪プランJSON
  - conversationHistory: 会話履歴（直近10ターン）

DynamoDB（永続化）:
  - 全セッションデータ（save-session Lambda 経由）
  - カルテデータ
```

A) この割り当てで問題ない  
B) 変更したい項目がある（[Answer]タグ後に具体的に記述）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

### Q4: AvatarController のカテゴリ内ランダム遷移タイマー

`setCategoryEmotion(categoryId)` を呼んだ後、カテゴリ内でランダムに感情が自動遷移する仕組みについて：

A) タイマーはAvatarController内部で管理。`setCategoryEmotion()` 呼び出し時に前のタイマーをクリアして新しいタイマーを起動  
B) タイマーは外部から制御。`startCategoryLoop(categoryId)` / `stopCategoryLoop()` の2メソッドに分離  
C) 遷移はAIの返答ごとに1回だけ（タイマーなし）。次のAI返答まで同じ感情を保持  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

### Q5: ApiClient の認証エラーハンドリング

JWT が失効した場合の自動リフレッシュ戦略はどうしますか？

A) 自動リフレッシュ — 401 受信時に Cognito の refreshToken でサイレントリフレッシュ → リトライ  
B) リダイレクト — 401 受信時にログイン画面へリダイレクト（シンプル）  
C) コールバック通知 — 401 受信時にアプリ側コールバックを呼び出し、ページごとに処理を任せる  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

### Q6: CloudFront の CORS・セキュリティヘッダー配信

SECURITY-04（HTTPセキュリティヘッダー）の適用方法を選択してください：

A) CloudFront Response Headers Policy で付与（推奨 — Lambda Function不要）  
B) API Gateway のCORS設定 + 静的ファイルはS3バケットポリシーで対応  
C) Lambda@Edge で動的付与（柔軟だがコスト・レイテンシ増）  
X) その他（[Answer]タグ後に記述）

[Answer]: A

---

### Q7: DynamoDB テーブルの暗号化とバックアップ

SECURITY-01（保存データ暗号化）の観点から：

A) AWS マネージドキー（SSE-DynamoDB）でテーブル暗号化 + ポイントインタイムリカバリ（PITR）有効化  
B) カスタマーマネージドキー（KMS CMK）でテーブル暗号化 + PITR 有効化  
C) AWS マネージドキーのみ（PITRはコスト考慮でオフ）  
X) その他（[Answer]タグ後に記述）

[Answer]: C

---

### Q8: プロンプトインジェクション対策の範囲

`input_validator.py` でのプロンプトインジェクション検知について：

A) 簡易ブロックリスト方式 — 「ignore previous instructions」「system:」等のパターンを正規表現で検知・拒否  
B) 文字数制限のみ — 入力長を制限することで攻撃の複雑さを抑制（ブロックリスト不使用）  
C) A + B の組み合わせ — ブロックリスト + 文字数制限 + 入力サニタイズ（HTMLエスケープ）  
X) その他（[Answer]タグ後に記述）

[Answer]: C

---

### Q9: property-based テスト対象の識別（PBT-01）

U0 のビジネスロジック候補を確認します。  
以下のうち、プロパティベーステストの対象として優先したいものを選んでください（複数選択可）：

A) `EmotionDefinitions.pickRandomInCategory()` — 同一カテゴリ内から返す・直前と重複しないという不変条件  
B) `StateManager` の 3層ステート読み書き — round-trip プロパティ（書き→読みで同値）  
C) `input_validator.py` のバリデーションロジック — invariant（有効入力は常に通過、無効入力は常に拒否）  
D) `AvatarController.exportConfig()` → `init()` の round-trip — エクスポート→インポートで同一状態再現  
E) 上記すべて  
X) その他（[Answer]タグ後に記述）

[Answer]: A, C

---

## 確認事項の提出方法

上記 Q1〜Q9 の `[Answer]:` タグの後に回答（A/B/C/D/E/X）を記入してチャットに貼り付けてください。  
このファイルを直接編集して内容を送ってもかまいません。

回答受領後、Functional Design 成果物（business-logic-model.md / domain-entities.md / business-rules.md / frontend-components.md）を生成します。
