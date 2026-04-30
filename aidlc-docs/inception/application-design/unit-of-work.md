# Unit of Work 定義

> AI-DLC INCEPTION - Units Generation 成果物  
> 生成日: 2026-04-30  
> 分割方針: 機能ドメイン単位（6ユニット + インフラ基盤）

---

## 分割方針サマリー

| 決定事項 | 内容 |
|---------|------|
| 分割粒度 | 機能ドメイン単位（6ユニット） |
| インフラ構築 | SAM一括デプロイ（全14 Lambda スタブ + Cognito + API GW + DynamoDB + S3 + CloudFront）|
| FE共通モジュール | AuthModule/ApiClient/StateManager/AvatarController を U0 に先行実装、残りは各ユニットで追加 |
| 実装順序 | U0 → U1 → U2 → U3 → U4 → U5（オプション）→ U6（最終） |
| ディレクトリ構成 | フラット構成（`backend/functions/<name>/` + `frontend/pages/<page>/` + `frontend/shared/`）|

---

## ユニット一覧

| ID | ユニット名 | Epic | SP | 優先度 | 状態 |
|----|----------|------|:--:|:------:|:----:|
| **U0** | 共通インフラ + FEコアモジュール | - | (基盤) | 最高 | 未着手 |
| **U1** | トップ画面 + Cognito認証 | E1 | 16 | P0 | 未着手 |
| **U2** | コンシェルジュコア | E2 | 49 | P0 | 未着手 |
| **U3** | 謝罪練習シミュレーション | E4 | 51 | P0 | 未着手 |
| **U4** | 謝罪後支援 + カルテ | E5 + E6 | 28 | P0 | 未着手 |
| **U5** | ストーリーモード | E3 | 13 | P1 | 未着手（U3完了後） |
| **U6** | 上司モード | E7 | 23 | P1 | 未着手（最終・時間が余れば） |
| | **合計** | | **180** | | |

---

## U0: 共通インフラ + FEコアモジュール

### 責務
- AWS インフラ全体の初回デプロイ（SAM）
- 全 Lambda スタブ（14本）のデプロイ（空の handler、ルーティング確立）
- フロントエンドコア共通モジュール実装

### バックエンド成果物

```
template.yaml          # SAM テンプレート（全リソース定義）
backend/
  functions/
    assess-apology/lambda_function.py      # スタブ
    evaluate-apology/lambda_function.py    # スタブ
    generate-opponent/lambda_function.py   # スタブ
    generate-story/lambda_function.py      # スタブ
    generate-plan/lambda_function.py       # スタブ
    text-to-speech/lambda_function.py      # スタブ
    generate-feedback/lambda_function.py   # スタブ
    generate-prevention/lambda_function.py # スタブ
    generate-follow-mail/lambda_function.py # スタブ
    save-session/lambda_function.py        # スタブ
    get-karte/lambda_function.py           # スタブ
    analyze-karte/lambda_function.py       # スタブ
    evaluate-guidance/lambda_function.py   # スタブ
    generate-guidance-feedback/lambda_function.py # スタブ
  shared/
    decorators.py        # @handle_errors デコレーター
    input_validator.py   # 入力バリデーション・プロンプトインジェクション対策
    prompt_loader.py     # プロンプトテンプレートローダー
    bedrock_client.py    # Bedrock 共通ラッパー
  prompts/
    assess-apology.txt
    evaluate-apology.txt
    generate-opponent.txt
    generate-story.txt
    generate-plan.txt
    generate-feedback.txt
    generate-prevention.txt
    generate-follow-mail.txt
    analyze-karte.txt
    evaluate-guidance.txt
    generate-guidance-feedback.txt
```

### フロントエンド成果物

```
frontend/
  shared/
    auth.js      # AuthModule（Cognito サインアップ/ログイン/トークン管理）
    api.js       # ApiClient（JWT 認証ヘッダー付き HTTP 共通化）
    state.js     # StateManager（3層ステート管理）
    avatar.js    # AvatarController（facesjs SVG + 30感情 + viseme + エフェクト）
    emotions.js  # EmotionDefinitions（30感情定義シングルトン）
  assets/
    facesjs.min.js  # facesjs フォーク版 IIFE バンドル
```

### ユーザーストーリー
なし（インフラ基盤・共通処理 / 技術的前提条件）

### AWS リソース
- API Gateway HTTP API v2（全15エンドポイント定義済み）
- Cognito User Pool + Identity Pool
- DynamoDB シングルテーブル（geza-data）
- S3（静的ホスティングバケット + prompts用）
- CloudFront ディストリビューション
- Lambda × 14（スタブ）
- SAM Layer: shared-utils-layer
### U0 完了基準

- [ ] `sam deploy` 成功（兡14 Lambda スタブ + Cognito + API GW + DynamoDB + S3 + CloudFront）
- [ ] Cognito User Pool でテストユーザー作成・ログイン成功
- [ ] API Gateway 兡15エンドポイントで 200 レスポンス（スタブ）
- [ ] CloudFront URL で index.html が表示される
- [ ] shared-utils-layer のインポートが兡14 Lambda で成功
- [ ] AuthModule でログイン → JWT取得 → ApiClient で API 呼び出し成功
- [ ] `backend/prompts/*.txt` スタブ配置（各 Lambda の prompt_loader.py が FileNotFoundError を出さない）

> **プロンプトスタブ配置について**: U0 完了時に `backend/prompts/*.txt` にサンプルテンプレート（プレースホルダー入り空ファイル）を全て配置する。実装時に各ユニットが内容を上書きする。
---

## U1: トップ画面 + Cognito認証

### 責務
- アプリケーションのエントリポイント実装
- Cognito 認証フロー（サインアップ/ログイン/ログアウト）
- モード選択 UI とアバター表示

### バックエンド成果物
なし（Cognito はフロントエンドから直接利用）

### フロントエンド成果物

```
frontend/
  pages/
    index.html   # TopPage HTML
    top.js       # TopPage ロジック（モード選択・認証ガード）
  shared/
    # U0 で実装済みモジュールを利用
```

### ユーザーストーリー

| US | タイトル | SP |
|----|---------|:--:|
| US-101 | トップ画面で謝罪ボスに出会う | 5 |
| US-102 | Cognito認証でログインする | 8 |
| US-103 | モードを選択して開始する | 3 |
| **合計** | | **16** |

### 依存 U0 成果物
- AuthModule (auth.js)
- AvatarController (avatar.js)
- StateManager (state.js)
- facesjs.min.js

---

## U2: コンシェルジュコア

### 責務
- 謝罪の全体プランニング支援（GEZAのコア機能）
- やらかし入力 → 角度アセスメント → 相手生成 → プラン作成 → 実施日管理
- SVG 角度メーター表示・ギャップ分析

### バックエンド成果物（Lambda実装）

```
backend/functions/
  assess-apology/lambda_function.py     # Nova Lite: 角度算出（0〜180°）
  generate-opponent/lambda_function.py  # Claude Sonnet: 相手プロフィール生成
  generate-plan/lambda_function.py      # Claude Sonnet: 謝罪プラン + ToDo
backend/prompts/
  assess-apology.txt
  generate-opponent.txt
  generate-plan.txt
```

### フロントエンド成果物

```
frontend/
  pages/
    inception.html     # InceptionPage HTML
    inception.js       # InceptionPage ロジック
    customize.html     # AvatarCustomizePage HTML
    customize.js       # AvatarCustomizePage ロジック
  shared/
    apology-meter.js   # ApologyMeter（SVG 0〜180° メーター）
```

### ユーザーストーリー

| US | タイトル | SP |
|----|---------|:--:|
| US-201 | やらかし内容を自由入力する | 5 |
| US-207 | 謝罪の角度をAIがアセスメントする | 8 |
| US-208 | AI角度 vs 自己申告のギャップを分析する | 5 |
| US-202 | 謝罪相手をAIが生成する | 13 |
| US-203 | 謝罪プランをAIが作成する | 5 |
| US-210 | 謝罪実施日を設定しカウントダウン管理する | 5 |
| US-211 | 謝罪実施当日の直前サポートを受ける | 3 |
| US-204 | 謝罪相手のアバターをカスタマイズする | 5 |
| **合計** | | **49** |

### 依存 U0/U1 成果物
- ApiClient, StateManager (U0)
- AuthModule → 認証ガード (U0/U1)
- AvatarController (U0)
- Cognito 認証 (U1)

---

## U3: 謝罪練習シミュレーション

### 責務
- アバターとのリアルタイム謝罪練習（GEZAのデモインパクトコア）
- テキスト/音声入力 → AI評価 → 感情アバター反応 → ゲージ更新
- Polly TTS + Viseme 口パク同期
- Transcribe Streaming 音声入力
- API障害時フォールバック（US-408）

### バックエンド成果物（Lambda実装）

```
backend/functions/
  evaluate-apology/lambda_function.py   # Nova Lite: 評価・感情分類
  text-to-speech/lambda_function.py     # Polly: MP3 + SpeechMarks
backend/prompts/
  evaluate-apology.txt
```

### フロントエンド成果物

```
frontend/
  pages/
    practice.html    # PracticePage HTML
    practice.js      # PracticePage ロジック
    feedback.html    # FeedbackPage HTML（練習結果部分）
    feedback.js      # FeedbackPage ロジック（練習結果部分 ← U3が所有しU4が拡張）
  shared/
    transcribe.js    # TranscribeClient（Transcribe Streaming WebSocket）
    polly-sync.js    # PollySyncController（MP3 + Viseme 同期再生）
```

### ユーザーストーリー

| US | タイトル | SP |
|----|---------|:--:|
| US-401 | 謝罪ボスがアバターとして画面に登場する | 13 |
| US-402 | テキストで謝罪を入力する | 5 |
| US-403 | 音声で謝罪を入力する | 8 |
| US-404 | 謝罪ボスが音声で返答する | 5 |
| US-405 | NGワードが検知される | 5 |
| US-406 | 謝罪ボスが追撃質問をする | 5 |
| US-407 | 謝罪結果のフィードバックを受ける | 5 |
| US-408 | API障害時にフォールバック動作をする | 5 |
| **合計** | | **51** |

### 依存 U0/U1/U2 成果物
- AvatarController, EmotionDefinitions, PollySyncController, TranscribeClient (U0)
- AuthModule, Cognito (U0/U1)
- 謝罪相手プロフィール（bossProfile）を sessionStorage 経由で U2 から引き継ぎ

---

## U4: 謝罪後支援 + カルテ

### 責務
- 謝罪フィードバック・改善謝罪文生成（E5）
- 再発防止策・チェックリスト生成（E5）
- フォローメール案生成（E5）
- セッション保存・カルテ一覧・傾向分析（E6）

### バックエンド成果物（Lambda実装）

```
backend/functions/
  generate-feedback/lambda_function.py     # Claude Sonnet: フィードバック
  generate-prevention/lambda_function.py   # Claude Sonnet: 再発防止策
  generate-follow-mail/lambda_function.py  # Claude Sonnet: フォローメール
  save-session/lambda_function.py          # DynamoDB: セッション保存
  get-karte/lambda_function.py             # DynamoDB: カルテ取得
  analyze-karte/lambda_function.py         # Nova Lite + DynamoDB: 傾向分析
backend/prompts/
  generate-feedback.txt
  generate-prevention.txt
  generate-follow-mail.txt
  analyze-karte.txt
```

### フロントエンド成果物

```
frontend/
  pages/
    feedback.js      # FeedbackPage ロジック（「再発防止策」「フォローメール」「チェックリスト」セクションを追加。U3実装済みの「練習結果フィードバック」セクションは変更しない）
    carte.html       # CartePage HTML
    carte.js         # CartePage ロジック
```

### ユーザーストーリー

| US | タイトル | SP | Epic |
|----|---------|:--:|:----:|
| US-501 | 再発防止策を生成する | 5 | E5 |
| US-502 | フォローメール案を生成する | 5 | E5 |
| US-209 | 謝罪準備チェックリストを生成する | 5 | E5 |
| US-601 | 謝罪カルテに結果が保存される | 5 | E6 |
| US-602 | 謝罪カルテを閲覧する | 8 | E6 |
| **合計** | | **28** | |

### 依存 U0〜U3 成果物
- SaveSessionLambda はU3のセッション終了時に呼び出し（U3との連携）
- FeedbackPage は U3 の PracticePage から遷移
- DynamoDB 保存済みデータを参照（U0のインフラ）

---

## U5: ストーリーモード（U3完了後・P1）

### 責務
- 難易度別謝罪ストーリーのAI生成
- ストーリー選択 UI とボスプロフィール表示
- PracticePage（U3）を「ストーリーモード」として再利用

### バックエンド成果物（Lambda実装）

```
backend/functions/
  generate-story/lambda_function.py    # Claude Sonnet: ストーリー生成
backend/prompts/
  generate-story.txt
```

### フロントエンド成果物

```
frontend/
  pages/
    story.html    # StoryPage HTML
    story.js      # StoryPage ロジック
```

### ユーザーストーリー

| US | タイトル | SP |
|----|---------|:--:|
| US-301 | 謝罪ストーリーを選択・生成する | 8 |
| US-302 | 高難度の謝罪ボスに挑戦する | 5 |
| **合計** | | **13** |

### 依存 U3 成果物
- PracticePage（story.js → practice.html へ遷移して練習開始）
- AvatarController (U0)

---

## U6: 上司モード（最終・時間が余れば）

### 責務
- 注意・指導内容の入力と部下役AIとの対話練習
- 建設性スコア・パワハラリスク評価
- 指導改善フィードバック

### バックエンド成果物（Lambda実装）

```
backend/functions/
  evaluate-guidance/lambda_function.py          # Nova Lite: 指導評価
  generate-guidance-feedback/lambda_function.py # Claude Sonnet: 改善スクリプト
backend/prompts/
  evaluate-guidance.txt
  generate-guidance-feedback.txt
```

### フロントエンド成果物

```
frontend/
  pages/
    boss.html    # BossPage HTML
    boss.js      # BossPage ロジック
```

### ユーザーストーリー

| US | タイトル | SP |
|----|---------|:--:|
| US-701 | 注意・指導内容を入力する | 5 |
| US-702 | 部下役AIと対話しながら指導を練習する | 13 |
| US-703 | 指導練習のフィードバックを受ける | 5 |
| **合計** | | **23** |

### 依存 U0/U1 成果物
- AuthModule, ApiClient, AvatarController (U0)
- 認証済みユーザー (U1)
- TextToSpeechLambda（US-702で上司が音声発話、U0スタブ → U3で実装済み）

---

## コード構成（ディレクトリ戦略）

Application Design の既存構成をそのまま採用（フラット構成）：

```
GEZA/
├── template.yaml                        # SAM テンプレート（全リソース）
├── backend/
│   ├── functions/
│   │   ├── assess-apology/
│   │   │   └── lambda_function.py       # U2 で実装
│   │   ├── evaluate-apology/
│   │   │   └── lambda_function.py       # U3 で実装
│   │   ├── generate-opponent/
│   │   │   └── lambda_function.py       # U2 で実装
│   │   ├── generate-story/
│   │   │   └── lambda_function.py       # U5 で実装
│   │   ├── generate-plan/
│   │   │   └── lambda_function.py       # U2 で実装
│   │   ├── text-to-speech/
│   │   │   └── lambda_function.py       # U3 で実装
│   │   ├── generate-feedback/
│   │   │   └── lambda_function.py       # U4 で実装
│   │   ├── generate-prevention/
│   │   │   └── lambda_function.py       # U4 で実装
│   │   ├── generate-follow-mail/
│   │   │   └── lambda_function.py       # U4 で実装
│   │   ├── save-session/
│   │   │   └── lambda_function.py       # U4 で実装（U3完了後に結合）
│   │   ├── get-karte/
│   │   │   └── lambda_function.py       # U4 で実装
│   │   ├── analyze-karte/
│   │   │   └── lambda_function.py       # U4 で実装
│   │   ├── evaluate-guidance/
│   │   │   └── lambda_function.py       # U6 で実装
│   │   └── generate-guidance-feedback/
│   │       └── lambda_function.py       # U6 で実装
│   ├── shared/
│   │   ├── decorators.py                # U0 で実装
│   │   ├── input_validator.py           # U0 で実装
│   │   ├── prompt_loader.py             # U0 で実装
│   │   └── bedrock_client.py            # U0 で実装
│   └── prompts/
│       ├── assess-apology.txt           # U2 で作成
│       ├── evaluate-apology.txt         # U3 で作成
│       ├── generate-opponent.txt        # U2 で作成
│       ├── generate-story.txt           # U5 で作成
│       ├── generate-plan.txt            # U2 で作成
│       ├── generate-feedback.txt        # U4 で作成
│       ├── generate-prevention.txt      # U4 で作成
│       ├── generate-follow-mail.txt     # U4 で作成
│       ├── analyze-karte.txt            # U4 で作成
│       ├── evaluate-guidance.txt        # U6 で作成
│       └── generate-guidance-feedback.txt # U6 で作成
└── frontend/
    ├── pages/
    │   ├── index.html + top.js          # U1 で実装
    │   ├── inception.html + inception.js # U2 で実装
    │   ├── customize.html + customize.js # U2 で実装
    │   ├── practice.html + practice.js  # U3 で実装
    │   ├── feedback.html + feedback.js  # U3/U4 で実装
    │   ├── carte.html + carte.js        # U4 で実装
    │   ├── story.html + story.js        # U5 で実装
    │   └── boss.html + boss.js          # U6 で実装
    ├── shared/
    │   ├── auth.js                      # U0 で実装
    │   ├── api.js                       # U0 で実装
    │   ├── state.js                     # U0 で実装
    │   ├── avatar.js                    # U0 で実装
    │   ├── emotions.js                  # U0 で実装
    │   ├── apology-meter.js             # U2 で実装
    │   ├── transcribe.js                # U3 で実装
    │   └── polly-sync.js                # U3 で実装
    └── assets/
        ├── facesjs.min.js               # U0 で配置
        └── style.css                    # 各ユニットで追加
```
