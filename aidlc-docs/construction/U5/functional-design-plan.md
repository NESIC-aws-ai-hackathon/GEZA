# U5 Functional Design Plan
## ストーリーモード

> AI-DLC CONSTRUCTION Phase — Functional Design  
> 生成日: 2026-05-10  
> 対象ユニット: U5（ストーリーモード）

---

## ユニット概要

| 項目 | 内容 |
|------|------|
| ユニットID | U5 |
| ユニット名 | ストーリーモード |
| Epic | E3 |
| SP | 13 |
| 優先度 | P1（U0〜U4 MVP 完了後のオプション） |
| ユーザーストーリー | US-301 / US-302 |
| 依存 | U0（共通基盤）、U1（認証・TOP画面）、U3（PracticePage 再利用）|

---

## 対象ユーザーストーリー

| ストーリーID | タイトル | SP | 受け入れ条件概要 |
|------------|---------|:--:|----------------|
| US-301 | 謝罪ストーリーを選択・生成する | 8 | 難易度別ストーリー一覧 → AI 生成 → 謝罪ボスプロフィール表示 → 練習開始 |
| US-302 | 高難度の謝罪ボスに挑戦する | 5 | 高難度ボスの設定（感情値高・クリア条件厳しい）→ 練習 → 結果記録 |
| **合計** | | **13** | |

---

## Functional Design 実行計画

- [ ] Step 1: ドメインモデル（StorySession エンティティ・ストーリーカテゴリ定義）
- [ ] Step 2: ユースケース（ストーリー選択→生成→練習遷移フロー）
- [ ] Step 3: 画面仕様（story.html 詳細）
- [ ] Step 4: コンポーネント設計（StoryPageController）
- [ ] Step 5: API 仕様（POST /story/generate）
- [ ] Step 6: generate-story Lambda 設計（プロンプト・JSON 出力スキーマ）
- [ ] Step 7: セキュリティコンプライアンス確認
- [ ] Step 8: 設計に関する確認事項への回答収集・曖昧性解消
- [ ] Step 9: Functional Design 成果物生成

---

## 設計上の確認事項

以下の点についてご回答ください。Functional Design の品質を高めるために必要です。

---

### Q1: ストーリーカテゴリの定義方針

謝罪ストーリーをどのように分類・提示しますか？

A) 固定カテゴリ + AI 生成内容（例:「職場のミス」「恋愛トラブル」「家族間の問題」「取引先クレーム」の4カテゴリを固定し、AI が状況テキストと相手プロフィールを生成する）  
B) 難易度のみ固定（易/中/難/超難 の4段階を選択 → AI が状況・カテゴリ・相手を自由に生成する）  
C) カテゴリ × 難易度の2次元選択（カテゴリ4種 × 難易度3段階 = 12パターン。AI が状況と相手を生成）  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q2: ストーリー生成後の確認フロー

AI がストーリーを生成した後、ユーザーはすぐに練習に入りますか？それとも内容確認フローがありますか？

A) 即時開始 — 生成完了後すぐに practice.html へ遷移する（U2 の相手確認と異なり確認なし）  
B) 確認画面あり — 相手プロフィール・状況テキスト・難易度を確認 → 「OK / 再生成」ボタン（U2 と同様）  
C) プレビューカード — story.html 内でボスカードをアコーディオン展開して確認 → 「挑戦する」ボタン押下で practice.html へ遷移  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q3: ストーリーモードと実案件モードの画面分離

practice.html は U3 で作成した実案件モードと共用します。ストーリーモードをどう識別しますか？

A) URL パラメータ — `?mode=story` を付与し、practice.js 内で `mode` を判定してクリア条件・タイトル表示を切り替える  
B) StateManager で判定 — `StateManager.set("practiceMode", "story")` を story.js でセットし、practice.js が起動時に判定する  
C) story 専用の practice ページを新規作成する（story-practice.html / story-practice.js として独立させる）  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q4: ストーリーモードのクリア条件

US-302「高難度の謝罪ボスに挑戦する」は難易度による差別化が必要です。クリア条件をどう設定しますか？

A) 難易度によってクリア閾値を変動させる（易: 信頼度≥70/怒り度≤30、中: 信頼度≥80/怒り度≤20、難: 信頼度≥90/怒り度≤10）  
B) 固定クリア条件（信頼度≥80/怒り度≤20 統一）だが、ボスの初期怒り度を難易度で変動させる（易: 怒り60 / 難: 怒り95）  
C) クリア条件なし（最大ターン数到達 or 手動終了のみ）— フィードバックでスコア表示  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q5: ストーリー結果の保存方針

ストーリーモードの練習結果を DynamoDB に保存しますか？

A) 保存する — save-session Lambda を呼び出し、DynamoDB に `SESSION#{sessionId}` として保存（カルテに表示）  
B) 保存しない — ローカルのみ（ストーリーモードはトレーニング用のため履歴不要）  
C) 部分保存 — ストーリーセッションID を localStorage に保存するが DynamoDB には書き込まない（オフライン対応）  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q6: 謝罪ボスのアバター設定

ストーリーモードのボスアバターはどうしますか？

A) AI が生成したボスプロフィール（性別・年代・性格）に基づき、facesjs でランダム生成（U2 の実案件モードと同じ方式）  
B) 難易度ごとにプリセットアバターを固定（易: 温和な顔、難: 厳しい顔）  
C) ストーリーカテゴリごとにプリセット（職場上司型 / 怒れる取引先型 / ドラゴン型(ゲーム演出) 等）  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q7: generate-story Lambda のプロンプト設計

`generate-story` が生成する JSON の必須フィールドはどれですか？（複数選択可）

```json
{
  "story_title": "...",
  "category": "...",
  "difficulty": "easy|medium|hard|extreme",
  "situation_text": "...",
  "opponent_profile": {
    "name": "...",
    "gender": "male|female",
    "age": "...",
    "personality": "...",
    "initial_anger": 0-100,
    "initial_trust": 0-100,
    "face_config": {}
  },
  "clear_condition": {
    "min_trust": 80,
    "max_anger": 20
  },
  "boss_greeting": "..."
}
```

A) 上記 JSON をそのまま採用する  
B) `opponent_profile.face_config` は generate-story ではなく、フロントエンドで facesjs.generate() により生成する（プロンプトから除外）  
C) `clear_condition` は固定値（Q4で決定）のため generate-story の出力には含めない  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

### Q8: エラーハンドリング方針

generate-story Lambda の失敗（Bedrock タイムアウト等）時のフォールバック方針はどうしますか？

A) エラーメッセージ表示 + 「もう一度試す」ボタン（U2/U4 と同様）  
B) ハードコードのフォールバックストーリーを3種程度用意し、API 失敗時はそこからランダム選択  
C) エラー時はそのまま practice.html へ遷移し、固定の「クレーム上司」ボスで練習開始  
X) その他（[Answer]タグ後に記述）

[Answer]: 

---

## 次のアクション

上記 Q1〜Q8 にご回答いただいた後、Functional Design 本文（`aidlc-docs/construction/U5/functional-design.md`）を生成します。
