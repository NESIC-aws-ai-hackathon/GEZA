# Unit of Work 分割計画

> AI-DLC INCEPTION - Units Generation (PART 1: Planning)  
> 生成日: 2026-04-30

---

## 計画概要

本プロジェクトはモノリシックなサーバーレスアプリケーション（SAM テンプレート1つ）であるが、
開発フェーズにおける作業管理のために論理的な「Unit of Work」に分割する。
各ユニットは独立してFunctional Design → Code Generationの順で開発可能な単位とする。

---

## 分割計画ステップ

- [x] ユーザー回答に基づきユニット分割方针を確定
- [x] `unit-of-work.md` を生成（ユニット定義・責務・コード構成）
- [x] `unit-of-work-dependency.md` を生成（ユニット間依存マトリックス）
- [x] `unit-of-work-story-map.md` を生成（ストーリー → ユニット マッピング）
- [x] 公29ストーリーがユニットに割り当て済であることを検証
- [x] ユニット境界と依存関係の妙当性を検証

---

## 質問（Unit of Work 分割方針）

以下の質問に回答してください。回答は `[Answer]:` タグの後に記入してください。

---

## Question 1
ユニット分割の粒度をどのレベルにしますか？

A) Epic 単位（7ユニット: E1〜E7 をそのまま1ユニットとする）
B) 機能ドメイン単位（4〜5ユニット: インフラ基盤 / コンシェルジュコア / 練習シミュレーション / カルテ・分析 / 上司モード）
C) ページ単位（8ユニット: 各ページ＋対応するLambdaをセットで1ユニット）
D) 最小粒度（ストーリー単位: 各USを独立ユニットとする）
E) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 2
共通インフラ（Cognito / API Gateway / DynamoDB / S3 / CloudFront）の構築タイミングは？

A) 最初のユニットとして独立して先行構築（他全ユニットの前提）
B) 最初に開発するユニットに含めて同時に構築
C) SAMテンプレートは分割せず全体を一括で初回デプロイし、Lambda関数だけユニット毎に追加
D) Other (please describe after [Answer]: tag below)

[Answer]: C
SAM deploy 1回で Cognito + API Gateway + DynamoDB + S3 + CloudFront が全部立ち上がる
Lambda関数はスタブ（空のhandler）で全14個デプロイしておき、ユニット開発時に中身を実装
API Gateway のルーティングも初回で全エンドポイント定義しておけば、フロントが先にAPIクライアントを実装できる

---

## Question 3
フロントエンド共通モジュール（AvatarController, EmotionDefinitions, StateManager, ApiClient, AuthModule, TranscribeClient, PollySyncController, ApologyMeter）の開発順序は？

A) 共通モジュール全部を最初の専用ユニットとして先に作る
B) 各ページユニットを作るたびに必要な共通モジュールを順次作る（遅延構築）
C) コア機能に必須のもの（AuthModule, ApiClient, StateManager, AvatarController）だけ先行し、残りは使う時に作る
D) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 4
開発優先順位（ユニットの実装順序）で最も重視する基準は？

A) ビジネスバリュー優先（コンシェルジュのコア機能 = Epic 2 を最優先）
B) 依存関係順（前提となるUS-101→102→103→201... の依存チェーン順）
C) デモインパクト優先（ハッカソン審査で見栄えする機能から先に）
D) リスク駆動（技術的に不確実な部分 = Bedrock連携・Transcribe・Polly を先に）
E) Other (please describe after [Answer]: tag below)

[Answer]: C + B ハイブリッド（デモインパクト × 依存関係順）
実装順は：
U0（インフラ）→ U1（トップ+認証）→ U2（コンシェルジュ）→ U3（練習）→ U4（支援+カルテ）

ただし U2とU3は技術リスクが高い（Bedrock連携・Transcribe・Polly Viseme同期）ので、リスク駆動の観点でも正しい順序になる。
---

## Question 5
練習モードの位置づけを踏まえた開発方針は？

A) コンシェルジュ（E2）が完成してから練習モード（E4）に着手（E2を完全に先行）
B) E2とE4を並行して進める（両方部分的に動く状態を早く作る）
C) MVP ではE4（練習）をスキップし、E2（コンシェルジュ）+ E5（支援）+ E6（カルテ）のみ実装
D) デモの核になるので練習モード（E4）を先に作り、コンシェルジュ（E2）は後回し
E) Other (please describe after [Answer]: tag below)

[Answer]: B
コンセプト的には E2（コンシェルジュ）がコアだが、デモ的にはE4（練習）が見栄えする
E2の「角度アセスメント」は API + SVGメーター表示で完結するので比較的速い
E4の「アバター対話」は技術的に複雑（facesjs + Polly Viseme + Transcribe）なので早めに着手したい
E2のInceptionPage完了 → E4のPracticePageに自然に流れるので、並行といっても実質は直列に近い

---

## Question 6
上司モード（Epic 7, 23SP）の扱いは？

A) 独立ユニットとして他のEpicと同時に計画（全機能均等に開発）
B) 優先度最低のユニットとして最後に実装（時間が余れば）
C) MVP対象外として今回のユニット計画からは除外し、将来対応とする
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 7
ストーリーモード（Epic 3, 13SP）の扱いは？

A) 練習モード（E4）と同一ユニットに含める（ストーリー＝練習の一種）
B) 独立ユニットとして分離（ストーリー生成は別機能ドメイン）
C) MVP対象外として今回のユニット計画からは除外し、将来対応とする
D) Other (please describe after [Answer]: tag below)

[Answer]: B
GenerateStoryLambda は独自のLambda（Claude Sonnet）で、練習モードとは入口が違う
ただし練習画面（PracticePage）自体は共有するので、U3完成後に「入口だけ追加」で動く
13SPと比較的軽いので、U3完了後のオプションとして良いポジション
---

## Question 8
コード構成のディレクトリ戦略は？ （Greenfield プロジェクト）

A) フラット構成: `backend/functions/<function-name>/` + `frontend/pages/<page>/` + `frontend/shared/`（Application Design の既存構成そのまま）
B) ユニット別ディレクトリ: `units/<unit-name>/backend/` + `units/<unit-name>/frontend/`（ユニット毎にまとめる）
C) レイヤー分離: `backend/` と `frontend/` を完全に分け、ユニットの概念はドキュメントのみで管理
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 回答方法

上記の `[Answer]:` タグの後に、選択肢の記号（A, B, C, D, E）または自由記述で回答してください。  
全質問への回答が完了したらお知らせください。
