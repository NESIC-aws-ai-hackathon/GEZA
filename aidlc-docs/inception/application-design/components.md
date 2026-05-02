# コンポーネント定義

> AI-DLC Application Design 成果物  
> 生成日: 2026-04-30  
> 回答根拠: application-design-plan.md Q1〜Q15

---

## フロントエンド コンポーネント

### 共通モジュール

| コンポーネント | ファイル | 責務 |
|-------------|---------|------|
| **AvatarController** | `frontend/shared/avatar.js` | facesjs SVGアバターの初期化・表情制御（30感情）・アイドルアニメーション・エフェクト（画面揺れ/明暗）・アバター外観カスタマイズ |
| **EmotionDefinitions** | `frontend/shared/emotions.js` | 30感情ラベルのCSS transform値・エフェクト種別・日本語名・カテゴリをシングルトンで管理 |
| **StateManager** | `frontend/shared/state.js` | 3層ステート管理（window.AppState: リアルタイム / sessionStorage: セッション引き継ぎ / DynamoDB: 永続） |
| **ApiClient** | `frontend/shared/api.js` | API GatewayへのHTTPリクエスト共通化（JWT認証ヘッダー付加・エラーハンドリング） |
| **AuthModule** | `frontend/shared/auth.js` | Cognito User Pool 認証（サインアップ・ログイン・トークン管理・未認証リダイレクト） |
| **TranscribeClient** | `frontend/shared/transcribe.js` | Cognito Identity Pool で取得した一時認証情報を使い、AWS Transcribe Streaming へ直接WebSocket接続。リアルタイム文字起こし結果をコールバックで通知 |
| **PollySyncController** | `frontend/shared/polly-sync.js` | Polly MP3（Base64）の音声再生と SpeechMarks viseme タイムコードを同期し、AvatarController.applyViseme() を呼び出す（50ms以内） |
| **ApologyMeter** | `frontend/shared/apology-meter.js` | 謝罪角度（0〜180°）のステージ別ピクトグラム画像表示・スタンプ演出・SE音再生・ステージ名表示・AI vs 自己申告ギャップ分析表示 |

### ページ コンポーネント

| コンポーネント | ファイル | 対応Journey / US | 責務 |
|-------------|---------|-----------------|------|
| **TopPage** | `frontend/pages/index.html` + `top.js` | Journey 1 / US-101〜103 | トップ画面・アバター表示・モード選択・Cognito認証ガード |
| **InceptionPage** | `frontend/pages/inception.html` + `inception.js` | Journey 2 / US-201〜203, 207〜208, 210〜211 | やらかし入力・謝罪角度アセスメント・ギャップ分析・謝罪相手生成・謝罪プラン・実施日管理・当日サポート |
| **AvatarCustomizePage** | `frontend/pages/customize.html` + `customize.js` | US-204 | アバターカスタマイズ（髪型/髪色/肌色/メガネ/性別）・プリセット選択 |
| **StoryPage** | `frontend/pages/story.html` + `story.js` | Journey 3 / US-301〜302 | ストーリー選択・難易度/テーマ設定・ボスプロフィール表示 |
| **PracticePage** | `frontend/pages/practice.html` + `practice.js` | Journey 4 / US-401〜408 | 謝罪練習コア画面（アバター・テキスト/音声入力・AI評価・ゲージ・フォールバック処理） |
| **FeedbackPage** | `frontend/pages/feedback.html` + `feedback.js` | Journey 4〜5 / US-407, US-501〜502 | 謝罪フィードバック・改善謝罪文・再発防止策・フォローメール |
| **CartePage** | `frontend/pages/carte.html` + `carte.js` | Journey 6 / US-601〜602 | 謝罪カルテ一覧・傾向分析・保存済みアバター復元 |
| **BossPage** | `frontend/pages/boss.html` + `boss.js` | Journey 7 / US-701〜703 | 上司モード（指導内容入力・部下役AI対話・建設性スコア・パワハラリスク） |

---

## バックエンド コンポーネント（Lambda 関数）

### 会話・評価系（Nova Lite 使用）

| コンポーネント | ディレクトリ | Bedrock モデル | 責務 |
|-------------|------------|--------------|------|
| **AssessApologyLambda** | `backend/functions/assess-apology/` | Nova Lite | 謝罪角度アセスメント（0〜180°算出・根拠説明・推奨アプローチ） |
| **EvaluateApologyLambda** | `backend/functions/evaluate-apology/` | Nova Lite | 謝罪評価・感情分類（30種）・NGワード検知・追撃質問生成・怒り度/信頼度更新 |
| **AnalyzeKarteLambda** | `backend/functions/analyze-karte/` | Nova Lite | カルテ傾向分析（NGワード傾向・スコア推移・弱点カテゴリ） |
| **EvaluateGuidanceLambda** | `backend/functions/evaluate-guidance/` | Nova Lite | 上司モード指導評価・建設性スコア・パワハラリスク・部下リアクション生成 |

### 高品質生成系（Claude Sonnet 使用）

| コンポーネント | ディレクトリ | Bedrock モデル | 責務 |
|-------------|------------|--------------|------|
| **GenerateOpponentLambda** | `backend/functions/generate-opponent/` | Claude Sonnet | 謝罪相手プロフィール生成（性格・怒りポイント・NGワード・第一声）＋ facesjs avatarSeed 生成 |
| **GenerateStoryLambda** | `backend/functions/generate-story/` | Claude Sonnet | ストーリー自動生成（ステージ名・背景・ボスプロフィール・クリア/失敗条件） |
| **GeneratePlanLambda** | `backend/functions/generate-plan/` | Claude Sonnet | 謝罪プラン生成（手段・タイミング・ToDo・手土産提案） |
| **GenerateFeedbackLambda** | `backend/functions/generate-feedback/` | Claude Sonnet | 謝罪フィードバック・改善謝罪文生成（事実認定・影響理解・再発防止策・フォロー期限） |
| **GeneratePreventionLambda** | `backend/functions/generate-prevention/` | Claude Sonnet | 再発防止策生成（チェックリスト・確認フロー・期限・責任者・報告方法） |
| **GenerateFollowMailLambda** | `backend/functions/generate-follow-mail/` | Claude Sonnet | フォローメール案生成（相手タイプに応じた文調） |
| **GenerateGuidanceFeedbackLambda** | `backend/functions/generate-guidance-feedback/` | Claude Sonnet | 上司モード改善スクリプト生成・問題フレーズ解説 |

### インフラ・データ系

| コンポーネント | ディレクトリ | 外部サービス | 責務 |
|-------------|------------|------------|------|
| **TextToSpeechLambda** | `backend/functions/text-to-speech/` | Amazon Polly Kazuha | テキスト → MP3（Base64）+ SpeechMarks visemes を並列取得して返却 |
| **SaveSessionLambda** | `backend/functions/save-session/` | DynamoDB | 謝罪セッション・会話ターン・指導セッションをシングルテーブルに保存 |
| **GetKarteLambda** | `backend/functions/get-karte/` | DynamoDB | ユーザーのカルテ一覧・セッション詳細取得（avatarSeed含む） |

### 共通ユーティリティ

| コンポーネント | ファイル | 責務 |
|-------------|---------|------|
| **ErrorHandlerDecorator** | `backend/shared/decorators.py` | `@handle_errors` デコレーター。全Lambda共通のtry/except・エラーレスポンス形式統一 |
| **InputValidator** | `backend/shared/input_validator.py` | 入力バリデーション共通層。文字数制限(500文字)・プロンプトインジェクションパターン検知・入力サニタイズ |
| **PromptLoader** | `backend/shared/prompt_loader.py` | `backend/prompts/` からプロンプトテンプレートを読み込み、変数を `{{variable_name}}` 形式で置換 |
| **BedrockClient** | `backend/shared/bedrock_client.py` | Bedrock invoke_model 共通ラッパー（Nova Lite / Claude Sonnet モデル切り替え対応） |

---

## インフラ コンポーネント

| コンポーネント | AWS サービス | 責務 |
|-------------|------------|------|
| **ApiGateway** | API Gateway HTTP API v2 | 全Lambda前段。JWT Authorizer で Cognito トークン検証。CORS設定。 |
| **CognitoUserPool** | Amazon Cognito User Pool | ユーザー認証（サインアップ・ログイン・トークン発行） |
| **CognitoIdentityPool** | Amazon Cognito Identity Pool | Transcribe Streaming 用の一時IAM認証情報をフロントエンドに提供 |
| **DynamoDB** | Amazon DynamoDB | シングルテーブル設計。セッション・カルテ・指導履歴・ユーザープロファイルを1テーブルで管理 |
| **S3StaticHosting** | Amazon S3 | フロントエンド静的ファイル（HTML/CSS/JS/facesjs.min.js）ホスティング |
| **CloudFront** | Amazon CloudFront | S3 + API Gateway の CDN 配信。HTTPS強制。 |
| **BedrockService** | Amazon Bedrock | Nova Lite / Claude Sonnet モデル呼び出し |
| **PollyService** | Amazon Polly | Kazuha Neural TTS + SpeechMarks 音声合成 |
| **TranscribeStreaming** | Amazon Transcribe Streaming | ブラウザから直接WebSocket接続による日本語リアルタイム文字起こし |
