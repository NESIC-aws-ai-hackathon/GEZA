# Application Design Plan

> AI-DLC Application Design フェーズ 計画書  
> 生成日: 2026-04-30  
> ステータス: 成果物生成完了・承認待ち

---

## 実行チェックリスト

- [x] 要件定義書・ユーザーストーリー読み込み
- [x] 設計スコープ・複雑度確認
- [x] 設計質問生成
- [x] ユーザー回答収集
- [x] 回答の曖昧さ分析
- [x] 設計成果物生成
  - [x] components.md
  - [x] component-methods.md
  - [x] services.md
  - [x] component-dependency.md
  - [x] application-design.md（統合）
- [ ] 承認待ち

---

## 設計スコープ確認

**対象**: 34ストーリー / 221SP / 9ユニット（U0〜U8）  
**アーキテクチャ**: マルチページ（Vanilla JS） + Lambda（Python 3.12）× 14 + API Gateway + DynamoDB + Cognito + S3 + CloudFront + Bedrock + Polly + Transcribe

---

## 設計質問

> **操作方法**: 各質問の `[Answer]:` タグに回答を記入してください。  
> 選択肢がある場合は記号（A, B など）で答えてください。複数選択可の場合はカンマ区切りで。

---

### セクション 1: コンポーネント境界（フロントエンド）

**Q1: フロントエンドのページ構成はどうしますか？**

A. 1ファイル（index.html）にすべてのモードをセクションで切り替え（SPA風）  
B. Epic/Journeyごとに複数HTMLファイルに分割（例: top.html, practice.html, carte.html）  
C. 1ファイルSPAだが、JS・CSSは機能別に複数ファイルに分割  
D. AIに最適な構成を判断させる

[Answer]: Bで共通モジュールは切り出してください

---

**Q2: フロントエンドの状態管理をどうしますか？**

A. グローバルなオブジェクト（例: `window.AppState`）に集約  
B. 各機能モジュールが自前のstateを持ち、イベントで連携  
C. LocalStorageをprimary storeとして使用（セッション跨ぎで保持）  
D. Cognito認証後のセッションは都度APIから取得（フロントstateは最小限）

[Answer]: A + C のハイブリッド

🗂️ 3層ステート設計
┌─────────────────────────────────────────────────┐
│  Layer 1: ページ内リアルタイム状態               │
│  → window.AppState（グローバルオブジェクト）      │
│  用途: 会話ターン、怒り度/信頼度、感情ラベル     │
│  寿命: ページ遷移で消滅 ← これでOK              │
├─────────────────────────────────────────────────┤
│  Layer 2: セッション状態（ページ間引き継ぎ）      │
│  → sessionStorage                                │
│  用途: やらかし入力→練習→支援のフロー引き継ぎ    │
│  寿命: タブを閉じるまで                          │
├─────────────────────────────────────────────────┤
│  Layer 3: 永続データ                             │
│  → DynamoDB（API経由）                           │
│  用途: 謝罪カルテ、ユーザー設定、練習履歴        │
│  寿命: 永続                                      │
└─────────────────────────────────────────────────┘

---

**Q3: アバター（facesjs SVG）の制御は独立モジュールにしますか？**

A. `avatar.js` として独立させ、他JSから呼び出す（`AvatarController`クラス等）  
B. 各ページのJSに直接埋め込む（モジュール分離不要）  
C. `avatar.js` + `emotions.js`（30感情定義）に2分割  
D. AIに判断させる

[Answer]: C

---

### セクション 2: Lambda 関数設計

**Q4: Lambda関数の分割粒度はどうしますか？**

A. **機能別細粒度**（例: `evaluate-apology`, `generate-opponent`, `text-to-speech`, `transcribe-audio`, `save-karte`… 各Lambda1責務）  
B. **Epic別中粒度**（例: `practice-lambda`（謝罪練習全般）, `inception-lambda`（相手生成+プラン）, `karte-lambda`（カルテ）, `boss-lambda`（上司モード））  
C. **1つのモノリシックLambda**（ルーティングでエンドポイント分岐）  
D. **2分割**（ `conversation-lambda`（会話リアルタイム系）＋ `management-lambda`（生成・保存・取得系））

[Answer]: A

---

**Q5: Bedrock のモデル使い分けを明示的に設計しますか？**

A. **明示的に分ける**：Nova Lite（会話評価・感情分類・NGワード検知・指導評価）＋ Claude Sonnet（謝罪相手生成・ストーリー生成・改善スクリプト生成）  
B. **Nova Liteに統一**：全用途Nova Lite（コスト優先）  
C. **Claude Sonnetに統一**：全用途Sonnet（品質優先）  
D. Lambda内でコンテキストに応じて動的にモデルを切り替える（設計に明記）

[Answer]: A

---

**Q6: Transcribe（音声文字起こし）はどのLambdaで処理しますか？**

A. フロントエンドからWebSocket接続で直接Transcribe Streamingに繋ぐ（API Gatewayを経由しない）  
B. 専用Lambda（`transcribe-lambda`）を経由してTranscribeと通信  
C. 謝罪練習Lambdaが内包（会話フローと一体化）  
D. フロントエンドで録音 → Base64 → LambdaにPOST → LambdaがTranscribeに投げる（非Streaming）

[Answer]: A

---

### セクション 3: データモデル

**Q7: DynamoDBのテーブル設計はどうしますか？**

A. **テーブル1本（シングルテーブル設計）**: PK=`userId#resourceType`, SK=`timestamp#resourceId` でセッション・カルテ・指導履歴を同テーブルに格納  
B. **テーブル3本**: `sessions`（謝罪セッション）, `kartes`（カルテサマリー）, `boss-training`（上司練習）で用途別に分割  
C. **テーブル2本**: `user-sessions`（全セッション共通）＋ `user-profiles`（ユーザー設定・傾向）  
D. AIに最適な設計を判断させる

[Answer]: A 構造が似ているので1テーブルにできると思う

---

**Q8: 謝罪セッションデータ（会話ターン履歴）の保存方針はどうしますか？**

A. 全ターンの会話テキストをDynamoDBに保存（カルテ傾向分析に利用）  
B. セッションのサマリーのみ保存（スコア・NGワード一覧・最終状態）  
C. 会話テキストはS3に保存し、DynamoDBにはS3キーとメタデータのみ  
D. Aに加えて会話テキストはTTL（例: 90日）で自動削除

[Answer]: A

---

### セクション 4: サービスレイヤー設計

**Q9: API Gateway のエンドポイント設計はどうしますか？**

A. **リソースベース** (`/apology`, `/opponent`, `/karte`, `/boss` 等、RESTful設計)  
B. **アクションベース** (`/evaluate-apology`, `/generate-opponent`, `/save-karte` 等、RPC風)  
C. **最小限** (エンドポイントを最小化し、リクエストbodyのactionで分岐)  
D. AIに判断させる

[Answer]: A

---

**Q10: Cognito認証トークンの検証はどこで行いますか？**

A. **API GatewayのJWT Authorizer**（Lambdaに到達する前にAPIGWが検証）  
B. **各Lambdaで検証**（python-joseなどでLambda内検証）  
C. **CloudFrontで検証**（Lambda@Edgeを使いCloudFront段で制御）  
D. AとBの組み合わせ（APIGW Authorizerを基本とし、必要なLambdaで追加検証）

[Answer]: A

---

### セクション 5: 設計パターン・依存関係

**Q11: プロンプトテンプレートの管理方法はどうしますか？**

A. `backend/prompts/` ディレクトリにテキストファイル（`.txt`）として配置し、Lambda起動時に読み込む  
B. Lambda環境変数に埋め込む  
C. S3に配置し、Lambda起動時にS3から取得（動的更新可能）  
D. Python定数（`PROMPTS = {...}` 形式）としてLambdaコードに定義

[Answer]: A

---

**Q12: エラーハンドリングの共通化はどうしますか？**

A. 各Lambdaで `try/except` を個別実装（AGENTS.md記載のパターン準拠）  
B. 共通エラーハンドリングデコレーター（`@handle_errors`）を作成し全Lambdaで使用  
C. Lambda Layerに共通ユーティリティを配置  
D. Aを基本とし、Bedrockタイムアウト等の特定エラーのみ共通関数化

[Answer]: B

---

**Q13: CloudFormation構成はどうしますか？**

A. **1スタック**（全リソースを1つのYAMLで管理）  
B. **2スタック**（インフラ層: VPC・Cognito・S3・CloudFront）＋（アプリ層: Lambda・APIGW・DynamoDB）  
C. **SAM（Serverless Application Model）** を使用  
D. **CDK（Cloud Development Kit）** を使用

[Answer]: C

---

### セクション 6: 差別化技術（facesjs / Polly）

**Q14: facesjs SVGアバターのカスタマイズ（US-204）はフロントエンドのどのタイミングで実行しますか？**

A. 謝罪相手生成後（US-202完了後）に別画面で実施 → 完了後に練習画面へ  
B. 練習画面内のサイドパネル/モーダルでリアルタイム変更  
C. 生成完了時に小さいプレビューを表示し、「このままでいい/カスタマイズする」を選択  
D. AIに判断させる

[Answer]: 

① 実案件モード（C → オプションで A）
   US-202 完了
     → アバター自動生成 + プレビュー表示
     → 「このまま練習する」→ practice.html へ
     → 「カスタマイズする」→ カスタマイズ画面（A）→ practice.html へ

② ストーリーモード（自動生成のみ・カスタマイズなし）
   US-301 でストーリー生成
     → ボスプロフィールの seed でアバター自動生成
     → そのまま practice.html へ
     ※ ストーリーモードはボスが「出題」なのでカスタマイズ不要

③ 上司モード（プリセット選択）
   US-701 で指導内容入力
     → 部下タイプ選択（「素直な新人」「反発する中堅」「年齢」「性別」等）
     → プリセット seed でアバター自動生成
     → オプションで微調整可能

④ トップ画面（固定 seed）
   index.html 読み込み時
     → 固定 seed のデフォルトボスを表示
     → アイドルアニメーションのみ

⑤ カルテ再表示（保存済み seed から復元）
   carte.html でセッション詳細表示
     → DynamoDB の avatarSeed から復元表示
     → カスタマイズ不可（履歴なので）

⑥ 再挑戦（同一 seed 引き継ぎ）
   US-407 フィードバック画面
     → 「再挑戦」→ 同じ bossProfile（seed含む）で practice.html へ
---

**Q15: Polly SpeechMarks（口パク）のデータはどのように返しますか？**

A. **MP3とSpeechMarksを別フィールドで返す**（`{ audio_base64: "...", visemes: [{time, value}, ...] }`）  
B. **MP3のみ返しSpeechMarksは別APIコール**で取得  
C. **SpeechMarksのみ返し**、フロントエンドで音声再生制御とVisemeタイミングを管理  
D. AのJSONをS3プリサインURLとして返す（大きいMP3対応）

[Answer]: A

---

## 回答後の次ステップ

すべての `[Answer]:` に回答後、AI が以下を実行します：

1. 回答の曖昧さチェック（追加質問が必要な場合は追記）
2. 設計成果物の生成（components.md / component-methods.md / services.md / component-dependency.md / application-design.md）
3. 承認確認 → Units Generation / Construction Phase へ
