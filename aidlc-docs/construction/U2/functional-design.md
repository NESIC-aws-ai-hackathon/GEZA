# U2 Functional Design
> AI-DLC CONSTRUCTION Phase — Functional Design 成果物  
> ユニット: U2 コンシェルジュコア  
> 生成日: 2026-05-05  
> ステータス: 承認待ち

---

## 設計方針サマリー

| 決定事項 | 内容 |
|---------|------|
| ページ構成 | 1ページ（inception.html）でステップ切り替え（入力→深掘り→角度→相手確認→プラン→カウントダウン） |
| 深掘り分析UI | チャット形式（1問ずつ表示、2〜5ラウンド） |
| 角度演出 | ApologyMeter 本実装（prototype/apology-meter.html を移植） |
| 相手生成後 | 確認画面 + OK / 再生成ボタン |
| アバターカスタマイズ | US-204 実装（プリセット選択 + 手動調整） |
| 台本表示 | accordion カード形式（セクションごとに折りたため）|
| データ保存 | DynamoDB（save-session Lambda 経由） |
| 直前サポート | US-211 実装（当日直前チェックリスト + AI直前アドバイス） |
| 非同期パターン | generate-plan のみ SQS 非同期。他は同期 |
| エラー回復 | エラーメッセージ + 「もう一度試す」ボタン |

---

## Step 1: ドメインモデル

### エンティティ

#### IncidentInput（やらかし入力）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| incident_summary | string | 自由記述（最大2000文字） |
| categories | string | カテゴリ（社内/顧客/友人/家族等） |
| relationship | string | 相手との関係性 |
| deadline | string | 謝罪期限（任意） |
| affected_count | number | 影響人数（任意） |
| past_incidents | boolean | 過去に同様の問題があったか |

#### ProbeSession（深掘りセッション）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| conversation_history | array | AI質問 + ユーザー回答の会話履歴 |
| round | number | 現在のラウンド数（1〜5） |
| status | string | `"probing"` / `"completed"` |
| enriched_summary | string | 深掘り完了後の強化サマリー |

#### AssessmentResult（角度アセスメント結果）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| ai_degree | number | AI判定角度（0〜180°） |
| user_degree | number | 自己申告角度（0〜180°） |
| gap | number | 差分（ai_degree - user_degree） |
| stage_name | string | ステージ名（14段階） |
| stage_description | string | ステージ説明 |
| reasons | array | 判定根拠リスト（factor + weight） |
| recommended_approach | string | 推奨アプローチ |

#### OpponentProfile（相手プロフィール）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| type | string | 相手タイプ（冷静なPM/感情的な先輩等） |
| personality | string | 性格説明 |
| gender | string | `"male"` / `"female"` |
| anger_level | number | 怒り度 0〜100 |
| trust_level | number | 信頼度 0〜100 |
| tolerance | number | 許容度 0〜100 |
| anger_points | array | 怒りポイントリスト |
| ng_words | array | NGワードリスト |
| first_message | string | 相手の第一声 |
| avatar_seed | number | facesjs seed値 |
| faceConfig | object | facesjs 顔設定（generate()結果） |

#### ApologyPlan（謝罪プラン）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| first_words | string | 第一声 |
| full_script | string | 全セリフ台本 |
| timing | string | タイミング・場所提案 |
| gift | string | 手土産提案 |
| todo_list | array | ToDoリスト（日付付き） |
| job_id | string | SQS 非同期ジョブID |
| status | string | `"pending"` / `"completed"` / `"error"` |

#### ApologySchedule（謝罪スケジュール）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| session_id | string | UUID v4 |
| apology_date | string | ISO8601（謝罪実施日） |
| practice_count | number | 練習回数 |
| achievement_rate | number | 達成率 0〜100 |
| created_at | string | 作成日時 |

---

## Step 2: 画面フロー詳細設計

### ページ構成（1ページ・ステップ切り替え）

```
frontend/pages/inception.html
  ├── Step 1: #step-input         やらかし入力フォーム
  ├── Step 2: #step-probe         深掘りチャット（2〜5ラウンド）
  │           └── [スキップボタン] → Step 3 へ
  ├── Step 3: #step-assessment    角度アセスメント結果（ApologyMeter）
  │           └── 自己申告入力 → ギャップ分析
  ├── Step 4: #step-opponent      相手確認（プロフィール + アバター + カスタマイズ）
  │           └── [OK → Step 5 / 再生成]
  ├── Step 5: #step-plan          謝罪プラン（accordion カード + ローディング）
  │           └── [練習開始 → pages/practice.html（U3）]
  ├── Step 6: #step-schedule      謝罪実施日設定 + カウントダウン
  └── Step 7: #step-day-support   当日直前サポート（当日のみ表示）
```

### ステップ遷移ロジック

```javascript
// Step 1 → Step 2: フォーム送信 → assess-apology 呼び出し後
// Step 2 → Step 3: probe-incident status="completed" or スキップ
// Step 3 → Step 4: 「相手を生成する」ボタン → generate-opponent
// Step 4 → Step 5: 「OK」ボタン → generate-plan（SQS submit + polling 開始）
// Step 5 → Step 6: 「実施日を設定する」ボタン
// Step 6 → Step 7: 謝罪当日 apology_date === today
```

---

## Step 3: 認証ガード

```javascript
// inception.html の先頭で AuthModule.requireAuth() を呼び出す
// 未認証の場合 index.html へリダイレクト
```

---

## Step 4: API 呼び出しフロー

### 4.1 やらかし入力 → 深掘り → 角度アセスメント

```
[1] ユーザーがやらかし内容を入力して「分析開始」ボタン押下
      ↓
[2] フォームバリデーション（incident_summary: 必須 / 最大2000文字）
      ↓
[3] Step 2 へ切り替え + assess-apology を呼び出し（初回）
    → 同時に probe-incident ラウンド1も呼び出し
      ↓
[4] probe-incident レスポンス
    - status="probing" → AIの質問をチャットUIに表示 → ユーザー入力待ち
    - ユーザーが回答送信 → probe-incident（round++）を再呼び出し
    - status="completed" → enriched_summary をメモリに保持 → Step 3 へ
    - [スキップ] → Step 3 へ（enriched_summary なし）
      ↓
[5] Step 3: assess-apology で ai_degree を表示（ApologyMeter 演出）
    → ユーザーが自己申告角度を入力 → ギャップ分析テキスト表示
    → 「相手を生成する」ボタン → Step 4 へ
```

### 4.2 相手生成 → プラン生成

```
[1] generate-opponent 呼び出し
    → ローディング表示（「相手を分析中...」）
      ↓
[2] 結果表示（相手プロフィールカード + アバター）
    → 「OK」/ 「再生成」ボタン
    → カスタマイズパネル（性別/プリセット/スライダー）
      ↓
[3] 「OK」→ generate-plan SQS submit
    → jobId を受け取り → polling 開始（指数バックオフ: 1s→2s→4s…最大60s）
    → Step 5 へ切り替え + ローディングカード表示
      ↓
[4] get-job-status(jobId) で polling
    → status="completed" → プランをページに展開
    → status="error" / timeout → エラーメッセージ + 「もう一度試す」ボタン
```

### 4.3 スケジュール保存（US-210）

```
[1] 実施日入力 → save-session 呼び出し
    payload: { session_id, apology_date, incident_summary, opponent_profile, apology_plan }
      ↓
[2] DynamoDB に保存 → StateManager に session_id を保存
[3] カウントダウン表示（残日数 + 進捗ダッシュボード）
[4] 24時間以内 → 警告バナー + Step 7 直前サポートへ誘導
```

### 4.4 直前サポート（US-211）

```
[1] 謝罪当日（today === apology_date）に inception.html を開くと Step 7 が自動表示
[2] 直前チェックリスト（ハードコード: 6項目）を表示
[3] AI直前アドバイス生成（generate-plan の簡易版プロンプト / 同期呼び出し）
    → 心構え・呼吸法・ブリーフィングの3点
[4] 「最後の練習」ボタン → pages/practice.html へ遷移
```

---

## Step 5: UIコンポーネント構造設計

### コンポーネントツリー

```
InceptionPage (inception.html + pages/inception.js)
├── AuthGuard（ページ先頭で requireAuth()）
├── StepIndicator（ステップ進捗インジケーター）
├── Step1: IncidentInputForm
│   ├── TextArea（incident_summary, max 2000文字）
│   ├── CategorySelect
│   ├── RelationshipInput
│   ├── DeadlineInput（任意）
│   ├── AffectedCountInput（任意）
│   ├── PastIncidentToggle
│   ├── SubmitButton（「分析開始」）
│   └── ValidationError
├── Step2: ProbeChat
│   ├── ChatBubble[AI]（question）
│   ├── ChatBubble[User]（回答表示）
│   ├── UserInputForm（テキスト入力 + 送信ボタン）
│   ├── RoundIndicator（「ラウンド 2/5」）
│   ├── SkipButton（「スキップして角度を確認」）
│   └── LoadingSpinner
├── Step3: AssessmentResult
│   ├── ApologyMeter（prototype/apology-meter.html から移植）
│   ├── DegreeDisplay（AI判定: ○○°/ ステージ名）
│   ├── ReasonList（判定根拠 accordion）
│   ├── SelfReportInput（自己申告角度入力）
│   ├── GapAnalysisText（ギャップ分析テキスト）
│   └── GenerateOpponentButton（「謝罪相手を生成する」）
├── Step4: OpponentConfirm
│   ├── OpponentProfileCard
│   │   ├── AvatarDisplay（facesjs large サイズ）
│   │   ├── ProfileDetails（タイプ/性格/怒り度/信頼度/NGワード）
│   │   └── FirstMessageBubble（相手の第一声）
│   ├── AvatarCustomizePanel（US-204）
│   │   ├── PresetSelect（厳しい上司/冷静PM/感情的先輩/家族…）
│   │   ├── GenderToggle
│   │   └── FaceAdjustSliders（髪/肌/目 系統スライダー）
│   ├── OKButton（「この相手で始める」）
│   └── RegenerateButton（「もう一度生成」）
├── Step5: ApologyPlan
│   ├── LoadingCard（generate-plan 待機中）
│   ├── PlanSection[FIRST_WORDS]（accordion）
│   ├── PlanSection[FULL_SCRIPT]（accordion）
│   ├── PlanSection[TIMING]（accordion）
│   ├── PlanSection[GIFT]（accordion）
│   ├── PlanSection[TODO_LIST]（accordion）
│   ├── PracticeButton（「練習を始める」→ practice.html）
│   └── ScheduleButton（「実施日を設定する」→ Step6）
├── Step6: ApologySchedule
│   ├── DatePicker（apology_date）
│   ├── SaveButton（save-session呼び出し）
│   ├── CountdownDisplay（残○○日）
│   └── ProgressDashboard（練習回数/達成率）
└── Step7: DaySupportPanel（当日のみ表示）
    ├── CheckList（6項目、チェック可）
    ├── AIAdviceCard（直前アドバイス3点）
    └── FinalPracticeButton（「最後の練習へ」）
```

---

## Step 6: ApologyMeter 本実装仕様

### prototype → 本実装 への移植方針

- `prototype/apology-meter.html` の JavaScript ロジック（6ゾーン×14段階定義・スタンプ演出・SE音）を `frontend/shared/apology-meter.js` として抽出・モジュール化
- CSS は `frontend/style.css` に統合（ライトモードのまま）
- HTML 構造は `inception.html` の Step3 コンテナ内に配置

### 主要メソッド

```javascript
// apology-meter.js (グローバル or モジュール)
ApologyMeter.render(container, degree);   // 指定角度でスタンプ演出実行
ApologyMeter.setDegree(degree);           // 角度を設定（演出なし・スライダー連動）
ApologyMeter.getStageInfo(degree);        // { stage_name, zone, description } を返す
ApologyMeter.playStampAnimation(degree);  // スタンプ演出（音 + アニメ + パーティクル）
```

---

## Step 7: アバターカスタマイズ仕様（US-204）

### プリセット定義

```javascript
const OPPONENT_PRESETS = [
  { id: 'strict_boss',    label: '厳しい上司',     overrides: { hair: 1, eyebrow: 3, mouth: 2 } },
  { id: 'calm_pm',        label: '冷静なPM',        overrides: { hair: 2, eyebrow: 1, glasses: 1 } },
  { id: 'emotional_sr',   label: '感情的な先輩',    overrides: { hair: 3, eyebrow: 4, mouth: 4 } },
  { id: 'family',         label: '家族（保護者）',  overrides: { hair: 5, eyebrow: 2 } },
  { id: 'friend',         label: '友人',            overrides: { hair: 4, mouth: 3 } },
];
```

### カスタマイズ反映ロジック

```javascript
// プリセット選択 → facesjs.override(faceConfig, overrides) で即座にアバター更新
// 性別トグル → gender を "male"/"female" で切り替え + avatar_seed 再生成
// スライダー → hair/skin/eyes の系統値を 0〜1 で変更 → facesjs.override() 再呼び出し
// リアルタイム描画: 変更のたびに facesjs.display() を呼び出す
```

---

## Step 8: ビジネスルール・バリデーション

### 入力バリデーション

| フィールド | ルール | エラーメッセージ |
|-----------|--------|----------------|
| incident_summary | 必須 / 最大2000文字 | 「やらかし内容を入力してください（最大2000文字）」 |
| user_degree | 0〜180の整数 | 「0〜180の数値を入力してください」 |
| apology_date | 今日以降の日付 | 「謝罪予定日は今日以降の日付を選択してください」 |
| probe response | 必須 / 最大500文字 | 「回答を入力してください」 |

- XSS対策: 全ユーザー入力は `textContent` / `value` でのみ DOM に挿入

### generate-plan 非同期フロー制御

```javascript
const MAX_POLL_WAIT_MS = 60000;  // 60秒
const POLL_INTERVALS = [1000, 2000, 4000, 5000, 5000, 5000, ...];  // 指数バックオフ後5s固定

async function pollJobStatus(jobId) {
  let elapsed = 0;
  let intervalIndex = 0;
  while (elapsed < MAX_POLL_WAIT_MS) {
    const interval = POLL_INTERVALS[Math.min(intervalIndex++, POLL_INTERVALS.length - 1)];
    await sleep(interval);
    elapsed += interval;
    const res = await ApiClient.get(`/job/${jobId}`);
    if (res.status === 'completed') return res.result;
    if (res.status === 'error') throw new Error(res.message);
  }
  throw new Error('TIMEOUT');
}
```

### 再生成ボタン制御

- 「再生成」ボタンは最大3回まで有効（4回目以降はグレーアウト + 「再生成上限に達しました」）
- OpponentProfile 再生成時は StateManager の相手データを上書き

---

## Step 9: ステート管理設計

### StateManager への追加（U2）

```javascript
// StateManager.session に追加
{
  inception: {
    currentStep: 1,           // 1〜7
    incidentInput: null,       // IncidentInput オブジェクト
    probeSession: {
      conversationHistory: [],
      round: 0,
      status: 'idle',          // 'idle' | 'probing' | 'completed' | 'skipped'
      enrichedSummary: null,
    },
    assessment: null,          // AssessmentResult
    opponentProfile: null,     // OpponentProfile（カスタマイズ済み）
    apologyPlan: {
      jobId: null,
      status: 'idle',          // 'idle' | 'pending' | 'completed' | 'error'
      data: null,
    },
    sessionId: null,           // save-session で採番した UUID
    apologyDate: null,         // 謝罪実施日（ISO8601）
    regenerateCount: 0,        // 再生成回数
  }
}
```

---

## Step 10: エラーハンドリング設計

### API エラーコード → UXメッセージ変換

| エラー条件 | 表示メッセージ | 表示場所 |
|-----------|--------------|---------|
| assess-apology 失敗 | 「分析に失敗しました。もう一度試してください」 | Step1/3 エラー欄 |
| probe-incident 失敗 | 「深掘り分析でエラーが発生しました。スキップして進めることができます」 | Step2 エラー欄 + スキップボタン強調 |
| generate-opponent 失敗 | 「相手の生成に失敗しました。もう一度試してください」 | Step4 エラー欄 |
| generate-plan タイムアウト | 「台本の生成に時間がかかっています。もう一度試してください」| Step5 エラーカード |
| save-session 失敗 | 「スケジュールの保存に失敗しました。接続を確認してください」 | Step6 エラー欄 |
| NetworkError | 「接続を確認してください」 | グローバルバナー |

---

## 成果物サマリー（U2 で生成するファイル）

| ファイル | 種別 | 説明 |
|---------|:----:|------|
| `frontend/pages/inception.html` | 新規 | 1ページ・7ステップ構成（やらかし〜直前サポート） |
| `frontend/pages/inception.js` | 新規 | InceptionPageController（全ステップ制御・API呼び出し） |
| `frontend/shared/apology-meter.js` | 新規 | ApologyMeter（prototype から移植・モジュール化） |
| `backend/functions/assess-apology/lambda_function.py` | 実装 | Nova Lite / 角度算出 + 根拠生成 |
| `backend/functions/probe-incident/lambda_function.py` | 実装 | Haiku 4.5 / 深掘り質問 or 本質分析 |
| `backend/functions/generate-opponent/lambda_function.py` | 実装 | Haiku 4.5 / 相手プロフィール + seed生成 |
| `backend/functions/generate-plan/lambda_function.py` | 実装 | Sonnet / 謝罪プラン + ToDo（SQS trigger → bedrock-dispatcher → DynamoDB） |
| `backend/prompts/assess-apology.txt` | 更新 | 角度算出プロンプト（本番版） |
| `backend/prompts/probe-incident.txt` | 更新 | 深掘り質問プロンプト（本番版） |
| `backend/prompts/generate-opponent.txt` | 更新 | 相手生成プロンプト（本番版） |
| `backend/prompts/generate-plan.txt` | 更新 | プラン生成プロンプト（本番版） |

---

## 依存関係確認

| 依存成果物 | 実装済み | 備考 |
|-----------|:-------:|------|
| auth.js（U0/U1） | ✅ | requireAuth() / getAccessToken() 利用 |
| api.js（U0） | ✅ | POST /apology/assess 等の呼び出し |
| state.js（U0） | ✅ | session layer に inception 追加 |
| avatar.js（U1修正済） | ✅ | 相手アバター表示に利用 |
| facesjs.min.js（U1） | ✅ | generate() / display() / override() |
| save-session Lambda | ✅ | U0 スタブ実装済み |
| get-job-status Lambda | ✅ | U0 完全実装済み |
| bedrock-dispatcher Lambda | ✅ | U0 完全実装済み（SQS → Bedrock → DynamoDB） |
| prototype/apology-meter.html | ✅ | ApologyMeter 移植元 |

---

## 拡張性メモ（将来フェーズ向け）

- U3: `opponentProfile` / `apologyPlan` を practice.html に引き継ぎ（StateManager 経由）
- U4: `sessionId` を使って save-session / get-karte で謝罪カルテ参照
- US-204 カスタマイズ: U2 で基本実装。U3 以降で詳細パーツ追加可能

---

## U2-EXT: 継続的相談機能（予定外追加・2026-05-06）

> **追加背景**: U2完了後レビューにて「プラン生成後に状況が変わった場合の相談機能」がUX上必要と判断。U2のStep5（謝罪プラン）に相談チャットパネルを追加実装。

### 追加ドメインモデル

#### ConsultMessage（相談メッセージ）

| フィールド | 型 | 説明 |
|-----------|:--:|------|
| role | "user" \| "assistant" | 発言者 |
| content | string | メッセージ本文（最大1000文字） |

#### ConsultResponse（AI応答）

| フィールド | 型 | 必須 | 説明 |
|-----------|:--:|:----:|------|
| advice | string | ✓ | アドバイス・返答（200〜500字） |
| revised_plan | object \| null | — | プラン修正が必要な場合のみ返す（部分更新） |

### 追加UIコンポーネント（Step5拡張）

```
Step5: ApologyPlan（拡張後）
├── ...（既存コンポーネント）
└── ConsultPanel（相談パネル・折りたたみ）
    ├── ConsultChatArea（#consult-chat-area）
    │   ├── ConsultBubble[user]（.consult-bubble.user）
    │   └── ConsultBubble[assistant]（.consult-bubble.assistant）
    ├── ConsultInputArea
    │   ├── Textarea（#consult-input, max 1000文字）
    │   └── SendButton（#btn-consult-send）
    └── RevisedPlanNotification（revised_plan返却時に表示）
        └── ApplyButton（「プランを更新する」）
```

### 追加APIフロー（/plan/consult）

```
[1] ユーザーが相談パネルで「AIに相談する」ボタンクリック → パネル展開
[2] ユーザーがメッセージ入力 → 送信ボタン or Enter
[3] POST /plan/consult 呼び出し
    payload: {
      session_id, incident_summary, opponent_type, opponent_anger_level,
      current_plan_summary, conversation_history（最大10ターン）, user_message
    }
[4] AI応答（advice）をチャットに追加
[5] revised_plan != null → 「プランを更新する」ボタン表示
[6] ユーザーが承認 → プランカード再描画
[7] 10ターン到達 → 入力欄無効化 + 「相談上限に達しました」メッセージ
```

### 追加ステート管理

```javascript
// StateManager.session.inception に追加
{
  consultHistory: [],          // ConsultMessage[] 配列（最大10ターン）
  pendingRevisedPlan: null,    // AI提案の未承認プラン（承認後 apologyPlan.data を更新）
}
```

### 追加スーツ色選択機能（OpponentProfile拡張）

- Step3（アバターカスタマイズ）に「服装：スーツ」選択時のみスーツ色選択UIを追加
- `SUIT_COLOR_MAP`（10色定義）で facesjs jersey オーバーライド
- `_opponentAppearance.suitColor` として StateManager に保存

### 追加成果物

| ファイル | 種別 | 説明 |
|---------|:----:|------|
| `backend/functions/consult-plan/lambda_function.py` | 新規 | Haiku 4.5 / 相談 + プラン再調整 |
| `backend/prompts/consult_plan.txt` | 新規 | 謝罪コンシェルジュAI相談プロンプト |
| `frontend/pages/inception.html` | 変更 | Step5相談パネル追加・スーツ色選択追加 |
| `frontend/pages/inception.js` | 変更 | _doConsult / _handleConsultSend / _addConsultBubble 追加 |
| `frontend/style.css` | 変更 | .consult-bubble / .inc-textarea スタイル追加 |
