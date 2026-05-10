# U4 Functional Design Plan
> AI-DLC CONSTRUCTION Phase — Functional Design（Part 1: Planning）
> ユニット: U4 謝罪後支援 + カルテ
> 作成日: 2026-05-09

---

## ユニット概要（unit-of-work.md より）

| 項目 | 内容 |
|------|------|
| **ユニット名** | U4: 謝罪後支援 + カルテ |
| **Epic** | E5（謝罪後支援）+ E6（謝罪カルテ） |
| **SP** | 28 |
| **優先度** | P0 |
| **依存** | U0, U1, U2, U3 |

### 責務
- 謝罪フィードバック・改善謝罪文生成（E5）
- 再発防止策・チェックリスト生成（E5）
- フォローメール案生成（E5）
- セッション保存・カルテ一覧・傾向分析（E6）

### 対象ユーザーストーリー

| US | タイトル | SP | Epic |
|----|---------|:--:|:----:|
| US-501 | 再発防止策を生成する | 5 | E5 |
| US-502 | フォローメール案を生成する | 5 | E5 |
| US-209 | 謝罪準備チェックリストを生成する | 5 | E5 |
| US-601 | 謝罪カルテに結果が保存される | 5 | E6 |
| US-602 | 謝罪カルテを閲覧する | 8 | E6 |
| **合計** | | **28** | |

---

## 設計確認事項 Q&A

以下の質問に回答してください。

---

**Q1: feedback.html の拡張方針**

U3 で実装済みの `feedback.html` / `feedback.js` に対して、U4 では「再発防止策」「フォローメール」「チェックリスト」セクションを追加します。

A) feedback.html に直接タブ追加（タブ切り替えUI）  
B) feedback.html を「練習フィードバック概要」として保持し、詳細専用の `feedback-detail.html` を新規作成  
C) セクションとしてフィードバック結果の下部に折り畳み形式で追加（accordion）  
D) その他（自由記述）

[Answer]: B

---

**Q2: generate-feedback Lambda との関係**

U3 では `generate-feedback` Lambda（Claude Sonnet）が `/feedback/generate` で `problems` + `improved_apology_text` + `overall_comment` を返却しています。  
U4 で再発防止策・フォローメール・チェックリストを追加する場合:

A) `generate-feedback` の1回のレスポンスに `prevention_plan` / `follow_mail` / `checklist` を追加（1 API 呼び出しで全部返す）  
B) `generate-prevention` / `generate-follow-mail` を別 Lambda として実装（各ボタン押下時に個別 API 呼び出し）  
C) `generate-feedback` をトリガー（ジョブ登録）として非同期で `generate-prevention` / `generate-follow-mail` を実行し、ポーリングで取得  
D) その他（自由記述）

[Answer]: B

---

**Q3: チェックリスト（US-209）の位置づけ**

US-209「謝罪準備チェックリストを生成する」は E5 に所属しています。このチェックリストの設計を確認します。

A) AI がセッション内容から動的に生成するチェックリスト（generate-feedback 系 Lambda で生成）  
B) 固定テンプレートのチェックリスト（謝罪前に確認すべき共通項目を静的に定義）  
C) A + B の組み合わせ（固定項目 + AIが文脈に応じて追加アイテムを生成）  
D) その他（自由記述）

[Answer]: C

---

**Q4: セッション保存（US-601）のトリガー**

謝罪カルテへのセッション保存（`save-session` Lambda）を呼び出すタイミングを確認します。

A) リハーサル終了（feedback.html 遷移時）に自動保存  
B) フィードバック画面で「カルテに保存する」ボタン押下時に保存  
C) U2（アセスメント完了時）と U3（リハーサル完了時）の両方のタイミングで段階的に保存  
D) その他（自由記述）

[Answer]: C

---

**Q5: カルテ一覧（US-602）の表示項目**

`carte.html` に表示するカルテ一覧の内容を確認します。どの粒度で各セッションを表示しますか？

A) 最小限: タイトル（相手の名前・種別）/ 謝罪角度スコア / 日付  
B) 標準: タイトル / 謝罪角度 / リハーサル最終スコア（怒り/信頼）/ ターン数 / 日付  
C) 詳細: B + 改善謝罪文冒頭 / 問題点リスト / 実施日での残日数  
D) その他（自由記述）

[Answer]: カルテは謝罪後の結果を保存する。謝罪管理画面でも結果を入力して謝罪完了ボタンを押すとカルテに結果が蓄積されていく方式

---

**Q6: カルテの傾向分析（`analyze-karte`）**

カルテ傾向分析 Lambda は `analyze-karte` として定義されています。この機能の実装方針を確認します。

A) U4 の MVP 範囲として実装する（Nova Lite が蓄積セッションを分析し傾向コメントを生成）  
B) U4 では一覧のみ実装し、傾向分析は U7/U8 以降にスコープアウト  
C) シンプルな統計値のみ表示（平均スコア・最高怒り度・改善推移グラフ）。LLM 分析は行わない

[Answer]: A

---

**Q7: feedback.html のローカルデータ / DynamoDB 永続化**

U3 では会話履歴をフロントエンドメモリのみで管理しています（DynamoDB 保存なし）。  
U4 のカルテ保存で DynamoDB に保存する内容を確認します。

A) 軽量: セッションメタデータのみ保存（スコア・ターン数・日付・相手概要）  
B) 標準: メタデータ + generate-feedback の返却結果（problems / improved_apology_text / overall_comment）  
C) 完全: B + 会話履歴全件（practice の conversationHistory を含む）  
D) その他（自由記述）

[Answer]: B

---

**Q8: フォローメール（US-502）の対象相手**

フォローメール案を生成する際の宛先・文体を確認します。

A) `opponentProfile` の情報（種別・名前・関係性）をもとに AI が適切な敬語レベルで自動判断  
B) ユーザーが送信先の関係性（上司 / 同僚 / 取引先 / その他）を選択し、それに応じたトーンで生成  
C) 自由入力欄に「補足メモ」を入力し、それを考慮してメール生成  
D) その他（自由記述）

[Answer]: A

---

## 設計チェックリスト

- [ ] ドメインモデル（CarteEntry / FeedbackResult / PreventionPlan）の定義
- [ ] ユースケース（UC-01〜UC-06）の詳細記述
- [ ] 画面仕様（feedback.html 拡張 / carte.html 新規）
- [ ] コンポーネント設計（FeedbackPageController 拡張 / CartePageController 新規）
- [ ] API 仕様（U4 使用分: /feedback/generate 拡張 / /prevention/generate / /mail/generate / /karte/list / /karte/analyze）
- [ ] セキュリティコンプライアンス（XSS/AUTH/PROMPT の各対策）
- [ ] 成果物サマリー

---

## 次のステップ

上記の質問にご回答ください。回答後、Functional Design 成果物（`aidlc-docs/construction/U4/functional-design.md`）を生成します。
