# GEZA — 総合謝罪支援コンシェルジュ

> **キャッチコピー：「謝る前に、怒られておけ。」**

---

## 審査員向け：読む順番

| # | ドキュメント | 所要時間 | 読む目的 |
|---|--------|:--------:|------|
| **①** | **README.md**（このファイル） | 3分 | プロダクト概要・デモシナリオ・MVP範囲 |
| **②** | [requirements.md](aidlc-docs/inception/requirements/requirements.md) | 5分 | 要件定義・非機能要件 |
| **③** | [stories.md](aidlc-docs/inception/user-stories/stories.md) | 5分 | INVEST済29ストーリー/180SP |
| **④** | [application-design.md](aidlc-docs/inception/application-design/application-design.md) | 5分 | Lambda構成・アーキテクチャ・Q&A |
| **⑤** | [feasibility-study.md](aidlc-docs/inception/feasibility/feasibility-study.md) | 3分 | 実証プロトタイプ結果・実機計測値 |

---

## コンセプト

**GEZA** は、謝罪・クレーム対応・注意指導など「失敗すると人間関係を壊す高リスクな会話」を  
AI 生成した仮想相手に対して事前練習・プランニングできる **総合謝罪支援コンシェルジュ** です。

```
主要機能（コア）
  謝罪角度アセスメント  ← やらかしの深刻度を AI が 0〜180° の角度で数値化・ビジュアル化
  謝罪プランニング      ← 相手分析 → タイムライン → スクリプト生成
  準備サポート          ← 準備チェックリスト・フォローメール・再発防止策

サブ機能（オプション）
  練習シミュレーション  ← プランが揃ったうえで本番前に体験したい人向け
  上司向け指導練習      ← 独立フロー（部下の指導スキルを磨く）
```

### キラー機能：謝罪角度アセスメント（ApologyMeter）

やらかしの内容を入力すると、AI が謝罪の深刻度を **0〜180° の角度** で数値化します。  
「会釈（5°）」から「焼き寝下座（175°）」まで 6 ステージで表現し、SVG アニメーションで可視化。  
さらに **AI 判定 vs 自己申告のギャップ分析** により、「自分が思うより相手はもっと怒っている」ことに気づけます。

```
0°   ─────── 30° ────── 60° ────── 90° ───── 120° ─────── 150° ──── 180°
会釈        深謝        土下座      寝下座     焦げ下座      焼き寝下座
（軽め）   （普通）    （重い）    （深刻）   （損害大）    （修復困難）
```

---

## ターゲットユーザー

### 3 ペルソナ

| ペルソナ | 属性 | 利用動機 | 成功基準 |
|---------|------|---------|---------|
| **Kenta（田中 健太）** | 28歳 SE | 本番謝罪前の短期集中練習 | 練習 3 回以上・自信度 7/10・NG ワードゼロ |
| **Misaki（佐藤 美咲）** | 24歳 広告代理店 | ゲーム感覚でスキルを継続強化 | 月 8 回以上・NG ワード率 50%削減 |
| **Seiichi（山田 誠一）** | 42歳 課長 | 部下指導のパワハラ防止 + 自身の謝罪練習 | 建設性スコア 80 以上・パワハラリスク「低」定着 |

### 想定利用シーン

- **企業研修** — クレーム対応・謝罪ロールプレイを個人でいつでも反復練習
- **新人教育** — 社内マナー研修の補完として「怒られ耐性」を安全に育成
- **管理職トレーニング** — パワハラ防止法対応・部下指導スキルの自己チェック
- **個人利用** — 謝罪が苦手な人が本番前に「最悪のパターン」をシミュレーション

### 市場背景

- カスタマーハラスメント対策の法制化議論（2024〜）が進み、企業のクレーム対応訓練需要が増大
- パワハラ防止法（2022年全面施行）により、管理職向け指導スキル研修の義務化が加速
- 謝罪・クレーム対応専門のロールプレイ AI ツールは国内に存在せず、**ニッチかつ高需要な空白市場**
- コンプライアンス研修市場（国内）は年間 2,000 億円超と推定され、eラーニングからAIインタラクティブ型へのシフトが加速中

### 既存手段との差別化

| 既存手段 | 課題 | GEZA の優位点 |
|---------|------|-------------|
| ChatGPT に相談 | シナリオ設計が自分任せ・評価指標なし | 謝罪角度の定量評価 + 相手自動生成 |
| ロールプレイ研修（対人） | 費用高・予約制・回数制限 | 24h いつでも・無制限練習 |
| eラーニング動画 | 一方向・反復練習できない | リアルタイムフィードバック付き対話 |
| 謝罪マニュアル本 | 頭でわかっても口から出ない | 実際に声に出す体験で定着 |

---

## ハッカソンテーマとの適合性：「何が人をダメにするのか」

ハッカソンのテーマは **「人をダメにするサービス」** です。  
GEZA はこのテーマを **2 つの軸** で体現しています。

### 軸 1：謝罪の「外注化」

謝罪とは本来、**自分が何をやらかしたのかを深く考え、相手の気持ちを想像し、言葉を一から選ぶ**という、
人間としての根幹的な行為です。

GEZA はその全プロセスを代行します。

- やらかし内容を入力すれば、AI が深刻度を角度で数値化する
- 相手の怒りポイント・NGワード・第一声は AI が生成する
- 謝罪プラン・タイムライン・フォローメール文面まで AI が用意する

反省も、葛藤も、言葉を探す時間も、全部いらない。  
**「謝る」という行為が、思考なしに完結する。**  
使い続けるほど、自分の頭で誠意を形にする力は静かに失われていきます。

> *「謝罪を AI に外注できる時代に、人間に残された誠意とは何か。」*

### 軸 2：謝罪のエンタメ化

GEZA では、謝罪相手は「謝罪ボス」として登場し、感情 30 種類で反応し、怒り度ゲージが動き、
クリア条件があり、許されると画面が明るくなります。

本来は **重くて、怖くて、消えてしまいたいような体験** であるはずの謝罪が、
ゲームのステージクリアと同じフォーマットに落とし込まれます。

- 失敗しても何度でもリセットできる
- 怒られることに慣れ、本物の怒りへの感度が鈍くなる
- 「謝れた」という達成感が、本来あるべき「申し訳なさ」を上書きする

**謝罪をエンターテインメントとして消費すること自体が、人としての倫理感をすり減らします。**  
GEZA はその消費装置です。

---

## 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | HTML5 + Vanilla JS/CSS（マルチページ構成）|
| アバター描画 | facesjs v5.0.3（フォーク版・data-feature 属性拡張）|
| 音声合成 | Amazon Polly（Kazuha, ja-JP, Neural）+ SpeechMarks Viseme 口パク同期 |
| 音声認識 | Amazon Transcribe Streaming（WebSocket 直接接続, ja-JP）|
| バックエンド | AWS Lambda（Python 3.12, 512MB）× 14 関数 |
| LLM | Amazon Nova Lite（評価・分類）/ Claude Sonnet（高品質生成）|
| DB | DynamoDB シングルテーブル（PAY_PER_REQUEST）|
| 認証 | Amazon Cognito（User Pool + Identity Pool）|
| API | API Gateway HTTP API v2（JWT Authorizer, 15 エンドポイント）|
| ホスティング | S3 + CloudFront |
| IaC | AWS SAM |
| コスト概算 | MVP 100 ユーザー ≈ $93/月（約 ¥14,000/月）|

---

## 開発目標とスコープ

### MVPライン（デモで必ず動かすもの）

```
U0: 共通インフラ + FEコアモジュール（SAMデプロイ）
U1: トップ画面 + Cognito認証
U2: コンシェルジュコア（謝罪角度アセスメント + 謝罪プラン生成）← キラー機能
U3: 謝罪練習シミュレーション（アバター対話 + ApologyMeter）← デモインパクト最大
```

**U1（Cognito認証）はU2・U3の必須依存のため、U0+U1+U2+U3 がデモ成立の最小セットです。** 謝罪角度を数値化（ApologyMeter）し、AIボスと対話練習できる状態を最優先で実現します。

### ストレッチゴール（時間が余れば）

```
U4: 謝罪後支援 + カルテ（再発防止策・フォローメール・謝罪履歴）
U5: ストーリーモード（難易度付きシナリオ）                ← P1
U6: 上司モード（部下指導練習）                           ← P1（最終）
```

| スコープ | ユニット | SP | 目標 |
|---------|---------|:--:|-----|
| **最低限** | U0+U1+U2+U3 | 116 | デモ成立 |
| **MVP完全体** | U0〜U4 | 144 | 書類審査アピール |
| **フルスコープ** | U0〜U6 | 180 | 全機能実装 |

### ハッカソンタイムライン

| フェーズ | 期間 | 完成ユニット | 成果物 |
|------|------|------------|------|
| **書類審査** | 現在 | なし（INCEPTION完了） | README + aidlc-docs（本リポジトリ） |
| **予選（5/30）まで** | フル5週間 | **U0+U1+U2**（コア体験） | 謝罪角度アセスメント + 相手生成 + プラン生成が動く |
| **予選後〜決勝** | +時間が許す限り | +U3（練習）→ +U4（カルテ） | フルスコープデモ |

> **リスク認識**: 180SP全体はハッカソン期間内の完成を約束していません。予選までに U0+U1+U2 のキラー機能（謝罪角度アセスメント）を動かすことを最優先とし、U3以降はボーナスと位置づけます。

---

## アーキテクチャ概要

```
ブラウザ
  ├── TopPage / InceptionPage / PracticePage / FeedbackPage / CartePage
  └── 共通モジュール: AvatarController, EmotionDefs, StateManager, ApiClient
              │ HTTPS (JWT)                  │ WebSocket（一時認証）
              ▼                              ▼
       API Gateway                  Amazon Transcribe Streaming
       HTTP API v2
              │
        Lambda × 14
          Nova Lite系: assess-apology, evaluate-apology, analyze-karte
          Sonnet系: generate-opponent, generate-plan, generate-feedback ...
              │
       DynamoDB ← → Amazon Bedrock ← → Amazon Polly（Viseme + MP3）
```

### 感情システム（30種類）

`rage → anger → fury → ... → empathy → relief → acceptance → forgiveness`  
カテゴリ構成：強い怒り(4) / 不満(3) / 悲しみ(3) / 冷たい(4) / 驚き(2) / 疑い(2) / 諦め(2) / 中立(3) / 好転(2) / 肯定(5) = **30種類**  
特殊エフェクト：rage → 画面揺れ、forgiveness → 画面が明るくなる

---

## INCEPTION フェーズの構成

AI-DLC（AI-Driven Lifecycle）メソドロジーに従い、以下の成果物を順序通りに生成・承認しました。

> **ドキュメント構成ポリシー**: `aidlc-docs/` = AI-DLC正式成果物（機械可読・フェーズ管理対象）、`docs/` = 人間向け可読版（要点抽出・概要参照用）

```
INCEPTION PHASE
  ├── 1. Requirements Analysis     → docs/requirements.md
  ├── 2. User Stories              → aidlc-docs/inception/user-stories/stories.md
  │       29ストーリー / 180 SP / 7 Epic
  ├── 3. Feasibility Study         → aidlc-docs/inception/feasibility/feasibility-study.md
  │       LLM速度・Transcribe精度・facesjs改造・Polly Viseme・SAMデプロイを事前実証
  ├── 4. Workflow Planning         → aidlc-docs/inception/plans/execution-plan.md
  ├── 5. Application Design        → aidlc-docs/inception/application-design/
  │       ├── application-design.md  （設計概要・アーキテクチャ・Q15決定事項）
  │       ├── components.md          （コンポーネント一覧）
  │       ├── component-methods.md   （メソッドシグネチャ）
  │       ├── services.md            （API/DB/インフラ・コスト概算）
  │       └── component-dependency.md（依存関係・データフロー図）
  └── 6. Units Generation          → aidlc-docs/inception/application-design/
          ├── unit-of-work.md           （7ユニット定義・ディレクトリ構成・完了基準）
          ├── unit-of-work-dependency.md（依存マトリックス・実装順フロー）
          └── unit-of-work-story-map.md （全29ストーリー → ユニット マッピング）
```

### ユニット構成

| ID | ユニット名 | Epic | SP | 実装順 |
|----|----------|------|:--:|:-----:|
| U0 | 共通インフラ + FEコアモジュール | — | (基盤) | 1 |
| U1 | トップ画面 + Cognito認証 | E1 | 16 | 2 |
| U2 | コンシェルジュコア | E2 | 49 | 3 |
| U3 | 謝罪練習シミュレーション | E4 | 51 | 4 |
| U4 | 謝罪後支援 + カルテ | E5+E6 | 28 | 5 |
| U5 | ストーリーモード | E3 | 13 | 6（P1）|
| U6 | 上司モード | E7 | 23 | 7（P1）|
| | **合計** | | **180** | |

---

## INCEPTION フェーズでの工夫点

### 1. プロトタイプによる事前実証（Feasibility-First）

設計開始前に不確実性の高い技術を先行検証しました。
prototype\videos
に事前検証結果の動画を配置しています。

| 検証項目 | 結果 | 設計への反映 |
|---------|------|------------|
| AWS Bedrock Nova Lite のレスポンス速度 | 1〜3 秒（実測） | 評価系 Lambda はすべて Nova Lite で統一 |
| facesjs SVG アバターの感情表現 | CSS transform で 30 感情を実証 | MP4 動画案を廃棄し SVG 方式を採用 |
| Amazon Polly SpeechMarks Viseme | 口パク同期 50ms 以内を確認 | TTS Lambda が MP3 + Viseme を 1 レスポンスで返す |
| Transcribe Streaming WebSocket | Lambda 経由より直接接続が安定 | フロントから Cognito Identity Pool 経由で直接接続 |
| AWS SAM デプロイ | プロトタイプで全リソース展開確認 | SAM を IaC として採用・template.yaml 一元管理 |

### 2. コンセプト進化の文書化

開発途中で「謝罪練習アプリ」から「総合謝罪支援コンシェルジュ」へコンセプトが変化しました。  
変更の影響を受けた全ドキュメントを追跡し、一括整合性修正を2回実施（audit.md エントリ 015/016 に記録）。

### 3. キラー機能の優先度明示

謝罪角度アセスメント（US-207/208）は後から追加した機能ですが、  
**デモインパクト最大のキラー機能** と位置づけ、U2（コンシェルジュコア）の中心に据えました。  
ApologyMeter（SVG メーター）の設計とメソッドシグネチャは Application Design で完全定義済みです。

### 4. セキュリティの設計込み込み

| 対策 | 実装方針 |
|------|--------|
| プロンプトインジェクション | `input_validator.py`：500文字制限・ブラックリスト検知・制御文字除去 |
| XSS | DOM 操作は `textContent` のみ（`innerHTML` 全面禁止） |
| API 認証 | Cognito JWT Authorizer（全15エンドポイント共通） |
| 個人情報 | 実在の人物名・企業名をボスとして生成しないプロンプト制約 |

### 5. コスト設計の透明化

MVPスコープ（100ユーザー/月）でのコスト概算を services.md に明記：

| サービス | 月額概算 |
|---------|---------|
| Amazon Bedrock（Nova Lite + Claude Sonnet） | ~$43 |
| Amazon Polly | ~$32 |
| Amazon DynamoDB | ~$15 |
| その他（Lambda / API GW / S3 / CloudFront / Transcribe） | ~$3 |
| **合計** | **≈ $93/月（≈ ¥14,000/月）** |

---

### 6. AI-DLC開始前の検討実施

AI-DLC開始前に要件についてをチームで徹底的に議論し、ユーザストーリー(草稿)として作成した。
 docs/draft-user-stories.md（⚠️草稿・参考のみ）
にドキュメントを配置し、開発の意図をより深くAIに伝えることで完成度を高める工夫を実施しました。

## ディレクトリ構成（予定）

```
GEZA/
├── frontend/
│   ├── index.html            # TopPage
│   ├── inception.html        # InceptionPage（角度アセスメント・相手生成）
│   ├── customize.html        # CustomizePage（アバターカスタマイズ）
│   ├── story.html            # StoryPage（ストーリーモード選択）
│   ├── boss.html             # BossPage（謝罪ボス対戦）
│   ├── practice.html         # PracticePage（謝罪練習対話）
│   ├── feedback.html         # FeedbackPage（結果・再発防止・フォローメール）
│   ├── carte.html            # CartePage（謝罪カルテ・傾向分析）
│   └── shared/
│       ├── auth.js           # AuthModule（Cognito）
│       ├── api.js            # ApiClient（JWT 付き HTTP）
│       ├── state.js          # StateManager（3層ステート）
│       ├── avatar.js         # AvatarController（facesjs + 30感情）
│       ├── emotions.js       # EmotionDefinitions
│       ├── apology-meter.js  # ApologyMeter（SVG 0〜180°メーター）
│       ├── transcribe.js     # TranscribeClient（音声入力）
│       └── polly-sync.js     # PollySyncController（Viseme 口パク同期）
│
├── backend/
│   ├── functions/            # Lambda 14本
│   ├── shared/               # shared-utils-layer
│   │   ├── decorators.py
│   │   ├── input_validator.py
│   │   ├── prompt_loader.py
│   │   └── bedrock_client.py
│   └── prompts/              # プロンプトテンプレート（*.txt）
│
├── template.yaml             # AWS SAM テンプレート
├── docs/                     # 統合仕様書
└── aidlc-docs/               # AI-DLC 成果物
    ├── aidlc-state.md
    ├── audit.md
    └── inception/
        ├── feasibility/
        ├── requirements/
        ├── user-stories/
        ├── plans/
        └── application-design/
```

---

## ビジネスモデル・市場ポジション

### マネタイズ戦略

#### BtoB（メイン）— 企業向け研修 SaaS

| プラン | 対象 | 提供内容 | 想定単価 |
|-------|------|---------|---------|
| **チームプラン** | 企業の研修担当 / HR | 年間ライセンス・シナリオ管理・受講ダッシュボード | ¥50,000〜/月（〜50名） |
| **エンタープライズ** | 大企業・コールセンター | カスタムシナリオ・API連携・管理者機能 | 要見積もり |
| **研修パッケージ** | 研修会社・士業 | 白ラベル提供・独自ブランドで再販 | レベニューシェア |

**タイミング**: カスタマーハラスメント対策法制化（2024〜検討中）、パワハラ防止法全面施行（2022）により、企業のコンプライアンス研修投資は拡大局面。

#### BtoC（補完）— 個人向け Freemium

| 層 | 提供 | 収益化 |
|---|------|-------|
| **無料** | 月5回まで練習 / Epic 1〜2 のみ | ユーザー獲得・口コミ |
| **プレミアム** | 無制限 + ストーリーモード + カルテ分析 | ¥980/月 |
| **単発購入** | 「緊急謝罪キット」（当日1回限り深掘りプラン） | ¥300/回 |

#### 広告（補完）

- 無料プランにビジネスコーチング・メンタルヘルスサービスのアフィリエイト

---

### 競合・差別化分析

#### 既存競合ポジション

| カテゴリ | 代表サービス | 課題 |
|---------|------------|------|
| ビジネスコミュニケーション訓練 | Speeko / LifeCoach AI | 汎用すぎる・謝罪特化なし |
| ロールプレイ AI | Character.AI / Claude | シナリオ設計が自分任せ・評価指標なし |
| ハラスメント研修 | eラーニング動画（各社） | 一方向・繰り返し練習できない・インタラクティブでない |
| 謝罪マニュアル | 書籍・記事 | リアルタイムフィードバックなし |

#### GEZA の差別化ポイント

```
① 謝罪特化 × 定量評価（ApologyMeter 0〜180°）
   → 「どのくらいやばいか」を角度で可視化。既存ツールにない指標

② 相手生成 × 感情アバター 30種類
   → 入力した状況から相手の性格・怒りポイントを AI が生成
   → ゲームのボス戦フォーマットで「怒られ耐性」を安全に育成

③ コンシェルジュ型フロー（アセスメント→プラン→練習→カルテ）
   → 一発の練習で終わらず「本番当日まで伴走」する継続利用設計

④ 上司向け指導モード（Epic 7）
   → 謝罪を受ける側（管理職）の訓練まで対応。B2B研修で双方向利用可能

⑤ AWS フルサーバーレス × 日本語特化
   → Polly Kazuha（日本語 Neural TTS）+ Transcribe 日本語ストリーミング
   → 国内企業向け展開・データ主権確保がしやすい
```

---

## デモシナリオ（想定3分）

```
1. [Top] アプリ起動 → Cognito サインイン
2. [InceptionPage] やらかし内容を入力
   → ApologyMeter が 0〜180° でアニメーション表示（例: 土下座ゾーン = 62°）
   → AI vs 自己申告ギャップを可視化
3. [InceptionPage] 謝罪相手（ボス）が生成される
   → facesjs アバターが登場、名前・性格・怒りポイントが表示
4. [PracticePage] 音声 or テキストで謝罪を入力
   → Nova Lite がリアルタイム評価 → 怒り度ゲージが変動
   → NG ワード検知でボスが激怒、アバター表情が rage に変化
   → Polly が日本語音声で返答、口パク同期
5. [FeedbackPage] 練習結果 → 改善案 + 再発防止策 + フォローメール案
```

### ユーザーフロー全体像

```
[入力]
  やらかし内容入力
       ↓
[アセスメント（キラー機能）]
  AIが深刻度を評価 → 謝罪角度 72°（土下座ゾーン）
  自己申告 45° vs AI 72° → 「甘く見がち」アラート
       ↓
[相手生成]
  AIが怒りチキな上司（鬼木部長）を自動生成
  性格・怒りポイント・地雷ワードが表示される
       ↓
[プラン生成]
  謝罪タイミング・言い方スクリプト・持ち物一覧
       ↓
[練習シミュレーション]
  アバター対話 (1ターン目)
  「本当に申し訳ございませんでした」
  ↳ NGワード検知 → ボスが rage に変化、怒り度+15
  「お年玉ですね」
  ↳ 謝罪言葉になっておらず怒り度変わらず
  2ターン目以降・。・・。
       ↓
[フィードバック]
  練習スコア + NGワード分析 + 改善スクリプト
  再発防止策・フォローメールテンプレート
  └→ カルテに保存（謝罪履歴・スコア推移）
```

---

## 現在のステータス

| フェーズ | 状態 |
|---------|:----:|
| INCEPTION | ✅ 完了・承認済み |
| CONSTRUCTION | ⏳ 未着手（U0 インフラ構築から開始予定）|

---

## ドキュメント一覧

| ドキュメント | パス |
|------------|------|
| 要件定義書 | `docs/requirements.md` |
| ユーザーストーリー（正式） | `aidlc-docs/inception/user-stories/stories.md` |
| 実現性調査書 | `aidlc-docs/inception/feasibility/feasibility-study.md` |
| アプリケーション設計 | `aidlc-docs/inception/application-design/application-design.md` |
| ユニット定義 | `aidlc-docs/inception/application-design/unit-of-work.md` |
| ユニット依存関係 | `aidlc-docs/inception/application-design/unit-of-work-dependency.md` |
| ストーリーマップ | `aidlc-docs/inception/application-design/unit-of-work-story-map.md` |
| AI-DLC 状態 | `aidlc-docs/aidlc-state.md` |
| 変更監査ログ | `aidlc-docs/audit.md` |
