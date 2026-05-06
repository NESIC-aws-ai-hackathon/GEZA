# U2 論理コンポーネント設計
> AI-DLC CONSTRUCTION Phase — NFR Design  
> 生成日: 2026-05-05  
> 対象ユニット: U2（コンシェルジュコア）  
> ステータス: 承認待ち

---

## コンポーネント一覧

| コンポーネント | 種別 | 役割 | 実装ファイル |
|-------------|:----:|------|------------|
| InceptionPageController | 新規 | 全ステップ制御・API オーケストレーション | `frontend/pages/inception.js` |
| IncidentInputController | 新規（inception.js 内） | Step1 入力フォーム制御 | `frontend/pages/inception.js` |
| ProbeChatController | 新規（inception.js 内） | Step2 深掘りチャット制御 | `frontend/pages/inception.js` |
| AssessmentController | 新規（inception.js 内） | Step3 角度表示・自己申告・ギャップ分析 | `frontend/pages/inception.js` |
| OpponentController | 新規（inception.js 内） | Step4 相手確認・カスタマイズ | `frontend/pages/inception.js` |
| PlanController | 新規（inception.js 内） | Step5 プラン表示（SQS polling） | `frontend/pages/inception.js` |
| ScheduleController | 新規（inception.js 内） | Step6 実施日設定・DynamoDB保存 | `frontend/pages/inception.js` |
| DaySupportController | 新規（inception.js 内） | Step7 当日直前サポート | `frontend/pages/inception.js` |
| ApologyMeter | 新規 | ApologyMeter（prototype 移植・モジュール化） | `frontend/shared/apology-meter.js` |
| ApiClient（U0） | 継承・拡張 | API 呼び出し・pollJob 追加 | `frontend/shared/api.js` |
| AuthModule（U0/U1） | 継承 | requireAuth / getAccessToken | `frontend/shared/auth.js` |
| StateManager（U0） | 継承・拡張 | inception ネームスペース追加 | `frontend/shared/state.js` |
| AvatarController（U1修正済） | 継承 | 相手アバター描画・カスタマイズ | `frontend/shared/avatar.js` |

---

## コンポーネント詳細

### InceptionPageController（新規）

**責務**: ステップ間のオーケストレーションと状態管理

```
InceptionPageController
├─ init()                         ← DOMContentLoaded
│   ├─ AuthModule.requireAuth()   ← 未認証 → index.html
│   ├─ _checkTodaySession()       ← 当日 apology_date なら Step7 へ
│   └─ showStep('input')          ← 通常は Step1 から開始
│
├─ showStep(stepId)
│   ├─ 全 step を hidden
│   ├─ 対象 step を表示
│   ├─ window.scrollTo(0, 0)
│   └─ StateManager.set('inception', 'currentStep', ...)
│
└─ [各 Step コントローラーへ委譲]
```

---

### IncidentInputController（Step1）

```
IncidentInputController
└─ onSubmit()
    ├─ バリデーション（incident_summary: 必須/2000文字）
    ├─ withLoading('submit-btn', async () => {
    │   ├─ POST /apology/assess → AssessmentResult を StateManager 保存
    │   ├─ POST /incident/probe (round=1) → probeSession 初期化
    │   └─ showStep('probe')
    └─ })
```

---

### ProbeChatController（Step2）

```
ProbeChatController
├─ onAnswerSubmit()
│   ├─ バリデーション（answer: 必須/500文字 — Q2: A）
│   ├─ ChatBubble[User] を追加表示
│   ├─ POST /incident/probe（round++, conversation_history）
│   │   ├─ status="probing" → ChatBubble[AI] で次の質問を表示
│   │   └─ status="completed" → enrichedSummary を保存 → showStep('assessment')
│   └─ エラー → エラー表示 + スキップボタン強調
│
└─ onSkip()
    └─ StateManager.set('inception', 'probeSession.status', 'skipped')
    └─ showStep('assessment')
```

---

### AssessmentController（Step3）

```
AssessmentController
├─ render(assessmentResult)
│   └─ ApologyMeter.render(container, assessmentResult.ai_degree)
│   └─ 判定根拠リスト表示（accordion）
│
├─ onSelfReportSubmit(userDegree)
│   ├─ バリデーション（0〜180 整数）
│   ├─ gap = ai_degree - userDegree
│   └─ ギャップ分析テキスト表示
│
└─ onGenerateOpponent()
    └─ withLoading('generate-opponent-btn', async () => {
        ├─ POST /opponent/generate（incident + enrichedSummary）
        ├─ OpponentProfile を StateManager 保存
        ├─ facesjs.generate({ seed: opponent_profile.avatar_seed })
        └─ showStep('opponent')
    })
```

---

### OpponentController（Step4）

```
OpponentController
├─ render(opponentProfile)
│   ├─ プロフィールカード表示（textContent で全フィールド）
│   ├─ 第一声バブル表示
│   └─ AvatarController.render('opponent-avatar', faceConfig)
│
├─ onPresetChange(presetId)     ← リアルタイム描画（Q3: A）
│   ├─ facesjs.override(faceConfig, preset.overrides)
│   └─ requestAnimationFrame → AvatarController.render()
│
├─ onGenderToggle(gender)       ← リアルタイム描画
│   ├─ gender 更新 → avatar_seed 再生成
│   └─ facesjs.generate({ seed }) → render()
│
├─ onSliderChange(param, value) ← リアルタイム描画
│   └─ facesjs.override(...) → render()
│
├─ onOK()
│   └─ showStep('plan') + PlanController.startPolling()
│
└─ onRegenerate()               ← 最大 3 回
    ├─ regenerateCount >= 3 → ボタン無効化
    └─ POST /opponent/generate → 再描画
```

---

### PlanController（Step5）

```
PlanController
├─ startPolling()
│   ├─ POST /plan/generate（trigger） → jobId 取得
│   └─ pollJob(jobId) → 結果受信後 renderPlan()
│
├─ renderPlan(apologyPlan)
│   ├─ accordion カード 5枚を展開（details/summary）
│   │   ├─ 第一声（first_words）
│   │   ├─ 全セリフ台本（full_script）
│   │   ├─ タイミング・場所（timing）
│   │   ├─ 手土産（gift）
│   │   └─ ToDo リスト（todo_list）
│   ├─ save-session（Step5完了時自動保存 — Q4: B）
│   └─ 「練習を始める」ボタン有効化
│
├─ onError(message)
│   └─ エラーカード表示 + 「もう一度試す」ボタン
│
└─ onPracticeStart()
    └─ window.location.href = 'practice.html'（U3 で実装）
```

---

### ScheduleController（Step6）

```
ScheduleController
├─ onDateSave(apologyDate)
│   ├─ バリデーション（今日以降）
│   ├─ save-session（apology_date 追加 PATCH — Q4: B）
│   ├─ StateManager.set('inception', 'apologyDate', apologyDate)
│   └─ カウントダウン表示（残○○日）
│
└─ renderDashboard()
    ├─ #countdown: Math.ceil((apologyDate - today) / 86400000) 日
    ├─ #practice-count: StateManager.get('inception').sessionId の practice_count
    └─ 24時間以内 → 警告バナー + Step7 へのリンク表示
```

---

### ApologyMeter（新規・共有モジュール）

```
ApologyMeter（frontend/shared/apology-meter.js）
├─ render(container, degree)
│   └─ スタンプ演出フルシーケンス（prototype 準拠）
│       ├─ playStampSlam(degree)     ← 衝撃音（3レイヤー）
│       ├─ playZoneSE(degree)        ← ゾーン別追加演出（14種）
│       └─ playStampAnimation(degree)← アニメーション + パーティクル
│
├─ setDegree(degree)               ← 演出なし（スライダー連動）
│   └─ スタンプ画像の角度表示のみ更新
│
├─ getStageInfo(degree)
│   └─ { stage_name, zone, description, color }（14段階定義）
│
└─ [内部] 6ゾーン × 14段階定義テーブル（prototype から移植）
```

---

## コンポーネント間依存関係

```
InceptionPageController
  ├─ AuthModule (auth.js)
  ├─ StateManager (state.js)          ← inception ネームスペース追加
  ├─ ApiClient (api.js)               ← pollJob() 追加
  ├─ IncidentInputController
  ├─ ProbeChatController
  ├─ AssessmentController
  │     └─ ApologyMeter (apology-meter.js)
  ├─ OpponentController
  │     └─ AvatarController (avatar.js)
  │         └─ facesjs (assets/facesjs.min.js)
  ├─ PlanController
  ├─ ScheduleController
  └─ DaySupportController
```

---

## U0/U1 からの変更サマリー

| ファイル | 変更種別 | 変更内容 |
|---------|:-------:|---------|
| `frontend/shared/api.js` | 追加 | `pollJob(jobId, options)` 追加（指数バックオフ + AbortController タイムアウト） |
| `frontend/shared/state.js` | 追加 | `inception` ネームスペース（currentStep / probeSession / assessment / opponentProfile / apologyPlan / sessionId / apologyDate / regenerateCount）|
| `frontend/pages/inception.js` | 新規 | InceptionPageController（全 Step コントローラー含む） |
| `frontend/pages/inception.html` | 新規 | 7ステップ HTML（Step1〜7） |
| `frontend/shared/apology-meter.js` | 新規 | prototype から移植・モジュール化 |
| `backend/functions/assess-apology/` | 実装 | スタブ → 本実装（Nova Lite） |
| `backend/functions/probe-incident/` | 実装 | スタブ → 本実装（Haiku 4.5） |
| `backend/functions/generate-opponent/` | 実装 | スタブ → 本実装（Haiku 4.5） |
| `backend/functions/generate-plan/` | 実装 | スタブ → 本実装（SQS trigger） |
| `backend/prompts/*.txt` | 実装 | 4本のプロンプトをプレースホルダー → 本番版に更新 |
