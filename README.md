# GEZA — 総合謝罪支援コンシェルジュ

> **キャッチコピー：「謝る前に、怒られておけ。」**

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

## ハッカソンテーマとの適合性：「何が人をダメにするのか」

ハッカソンのテーマは **「人をダメにする」** です。  
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
| Amazon Bedrock（Nova Lite + Claude Sonnet） | ~$50 |
| Amazon Polly | ~$15 |
| Amazon Transcribe | ~$10 |
| その他（DynamoDB / Lambda / CloudFront 等） | ~$18 |
| **合計** | **≈ $93/月（≈ ¥14,000/月）** |

---

## ディレクトリ構成（予定）

```
GEZA/
├── frontend/
│   ├── index.html            # TopPage
│   ├── inception.html        # InceptionPage（角度アセスメント・相手生成）
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
