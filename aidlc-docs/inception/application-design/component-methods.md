# コンポーネント メソッド定義

> AI-DLC Application Design 成果物  
> 生成日: 2026-04-30  
> 注意: 詳細なビジネスロジックは Construction Phase の Functional Design で定義する

---

## フロントエンド 共通モジュール

### AvatarController (`frontend/shared/avatar.js`)

```javascript
class AvatarController {
  // アバターを初期化し、facesjs SVGを指定コンテナに描画する
  // seed: 同一人物を再現するためのシード値
  init(containerEl, seed)

  // 感情IDに対応するCSS transformを適用する（0.5秒以内のtransition）
  // emotionId: emotions.jsで定義された30感情ID（例: "rage", "forgiveness"）
  setEmotion(emotionId)

  // アイドルアニメーション開始（瞬き・視線移動・頭の揺れ）
  startIdle()

  // アイドルアニメーション停止
  stopIdle()

  // 発話中アニメーション開始（speakingNod）
  startSpeaking()

  // 発話終了 → アイドルに戻る
  stopSpeaking()

  // Viseme値に応じた口形状をdata-feature="mouth"に適用する
  // visemeValue: "sil" | "a" | "i" | "u" | "e" | "o" | "p"
  applyViseme(visemeValue)

  // 画面揺れエフェクト（rage/shock用）
  triggerShake()

  // 画面明暗変化エフェクト（forgiveness用）
  triggerBrighten()

  // アバター外観パラメータ更新（カスタマイズ用）
  // params: { hairStyle, hairColor, skinColor, glasses, gender }
  updateAppearance(params)

  // 現在のアバター設定をJSONで返す（DynamoDB保存用）
  exportConfig()
}
```

---

### EmotionDefinitions (`frontend/shared/emotions.js`)

```javascript
// 指定感情IDの定義オブジェクトを返す
// 戻り値: { id, nameJa, category, cssTransform, effect, description }
getEmotion(emotionId)

// 指定感情IDのCSS transform値オブジェクトを返す
// 戻り値: { eyebrow: {...}, eye: {...}, mouth: {...}, head: {...} }
getEmotionCSS(emotionId)

// 指定感情IDの特殊エフェクト種別を返す
// 戻り値: "shake" | "brighten" | null
getEffect(emotionId)

// 全30感情の定義配列を返す
getAllEmotions()
```

---

### StateManager (`frontend/shared/state.js`)

```javascript
// window.AppState（ページ内リアルタイム状態）の読み書き
// 用途: 感情ラベル・怒り度・信頼度・会話ターン
setAppState(key, value)
getAppState(key)
clearAppState()

// sessionStorage（セッション間引き継ぎ状態）の読み書き
// 用途: やらかし入力→練習→支援のフロー引き継ぎ、avatarSeed、bossProfile
setSessionData(key, value)
getSessionData(key)
clearSession()

// 現在の練習セッションオブジェクト全体を返す
// 戻り値: { sessionId, bossProfile, angerLevel, trustLevel, conversationHistory, avatarSeed }
getCurrentSession()

// 新しい練習セッションを初期化してsessionStorageに保存
// 戻り値: sessionId（UUIDv4）
initSession(bossProfile)
```

---

### ApiClient (`frontend/shared/api.js`)

```javascript
// JWT認証ヘッダー付きのPOSTリクエストを送信
// endpoint: "/apology/evaluate" 等
// body: リクエストボディオブジェクト
// 戻り値: Promise<ResponseObject>
async post(endpoint, body)

// JWT認証ヘッダー付きのGETリクエストを送信
async get(endpoint, params)

// CognitoトークンからAuthorizationヘッダー文字列を生成
// 戻り値: "Bearer <idToken>"
getAuthHeader()

// レスポンスエラーを共通フォーマットで処理（US-408フォールバック含む）
handleError(error, fallbackFn)
```

---

### TranscribeClient (`frontend/shared/transcribe.js`)

```javascript
// Cognito Identity Pool から一時認証情報を取得し、
// Amazon Transcribe Streaming へ WebSocket 接続を開始する
// onTranscript: 文字起こし結果を受信するコールバック (text, isFinal) => void
async startStreaming(onTranscript)

// 文字起こしを停止し、確定テキストを返す
// 戻り値: Promise<string>
async stopStreaming()

// Cognito Identity Pool から Transcribe 用一時認証情報を取得
// 戻り値: Promise<{ accessKeyId, secretAccessKey, sessionToken }>
async getTemporaryCredentials()

// WebSocket 接続エラー時のフォールバック（US-408 AC-3）
// → テキスト入力エリアにフォーカスを移動し、音声不可通知を表示
handleConnectionError()
```

---

### PollySyncController (`frontend/shared/polly-sync.js`)

```javascript
// MP3音声（Base64）とviseme配列を受け取り、同期再生する
// audioBase64: Pollyが返したMP3のBase64文字列
// visemes: [{time: number(ms), value: string}, ...] SpeechMarksデータ
// avatarController: 口パク制御のためのAvatarControllerインスタンス
playWithSync(audioBase64, visemes, avatarController)

// viseme配列を音声開始時刻を起点にスケジューリングする
// 各タイムコードで avatarController.applyViseme() を呼び出す（50ms以内）
scheduleVisemes(visemes, audioStartTime, avatarController)

// 再生を停止し、口をsil（閉じ）に戻す
stop(avatarController)

// Polly TTS失敗時のフォールバック（US-408 AC-2）
// → 音声なしアイコンを表示してテキストのみで継続
handleTTSFailure()
```

---

### ApologyMeter (`frontend/shared/apology-meter.js`)

```javascript
class ApologyMeter {
  // ピクトグラム画像・スタンプ演出・SE音を指定コンテナに初期描画する
  // containerEl: メーターを描画するコンテナ要素
  init(containerEl)

  // 謝罪角度をセットし、ステージ別ピクトグラム画像をスタンプ演出（ドン！と打ち付け）＋SE音で表示
  // degree: 0〜180 (会釈〜焼き寝下座)
  setDegree(degree)

  // 現在の角度に対応するステージ名を返す
  // 戻り値: "会釈" | "深謝" | "土下座" | "寝下座" | "焦げ下座" | "焼き寝下座"
  getStageName()

  // AIアセスメント値とユーザー自己申告値のギャップを視覚的に表示する
  // aiDegree: AIが算出した角度 (0〜180)
  // userDegree: ユーザーが自己申告した角度 (0〜180)
  showGapAnalysis(aiDegree, userDegree)

  // メーターをリセット（0°に戻す）
  reset()
}
```

---

## バックエンド Lambda 関数

### AssessApologyLambda (`backend/functions/assess-apology/lambda_function.py`)

```python
# Lambda エントリポイント（AGENTS.md パターン準拠 + @handle_errors）
@handle_errors
def lambda_handler(event, context):
    # body: { situation_text, opponent_relationship, severity_self_assessment }
    # 戻り値: { degree(0-180), stage_name, rationale, recommended_approach,
    #          gap_analysis: { ai_degree, user_degree, gap_description } }
    pass
```

---

### EvaluateApologyLambda (`backend/functions/evaluate-apology/lambda_function.py`)

```python
# Lambda エントリポイント（AGENTS.md パターン準拠 + @handle_errors）
@handle_errors
def lambda_handler(event, context):
    # body: { apology_text, opponent_profile, conversation_history, session_id }
    # 戻り値: { emotion_label, response_text, anger_level, trust_level,
    #           ng_words, follow_up_question, anger_delta, trust_delta }

# Bedrock Nova Lite を呼び出し謝罪を評価する
# 戻り値: dict（emotion_label / response_text / ng_words / follow_up_question）
def evaluate_apology(apology_text, opponent_profile, conversation_history)

# ゲージ値を更新する（怒り度/信頼度の増減計算）
# 戻り値: { new_anger_level, new_trust_level, anger_delta, trust_delta }
def update_gauges(current_levels, evaluation_result)
```

---

### GenerateOpponentLambda (`backend/functions/generate-opponent/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { incident_summary, categories, relationship, deadline }
    # 戻り値: { opponent_profile, avatar_seed, first_message }

# Bedrock Claude Sonnet で謝罪相手を生成する
# 戻り値: dict（type / personality / anger_level / trust_level / tolerance /
#              anger_points / ng_words / first_message）
def generate_opponent(incident_summary, context)

# プロフィールから facesjs 用 seed 値を生成する
# 戻り値: int（0〜9999999）
def generate_avatar_seed(opponent_profile)
```

---

### GenerateStoryLambda (`backend/functions/generate-story/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { difficulty, theme, user_profile }
    # 戻り値: { story_id, stage_name, background, boss_profile, clear_condition, fail_condition }

# Bedrock Claude Sonnet でストーリーを生成する
# 戻り値: dict（stage_name / background / boss_profile / clear_condition / fail_condition）
def generate_story(difficulty, theme, user_profile)

# ボスプロフィールを生成する（ストーリー設定に基づく）
# 戻り値: dict（type / personality / anger_points / ng_words / avatar_seed）
def generate_boss_profile(story_context)
```

---

### GeneratePlanLambda (`backend/functions/generate-plan/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { incident_summary, opponent_profile, apology_degree, deadline }
    # 戻り値: { plan, todos, timing, gift_suggestion, script }

# Bedrock Claude Sonnet で謝罪プランを生成する
# 戻り値: dict（approach / timing / todos / gift_suggestion / script）
def generate_plan(incident_summary, opponent_profile, apology_degree)

# 謝罪スクリプト（台本）を生成する
# 戻り値: list of { phase, text, notes }
def generate_script(plan_context, opponent_profile)
```

---

### GenerateFeedbackLambda (`backend/functions/generate-feedback/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { session_id, conversation_history, opponent_profile, final_scores }
    # 戻り値: { summary, improved_apology, strengths, weaknesses, score }

# Bedrock Claude Sonnet で謝罪フィードバックを生成する
# 戻り値: dict（summary / improved_apology / strengths / weaknesses / overall_score）
def generate_feedback(conversation_history, opponent_profile, final_scores)
```

---

### GeneratePreventionLambda (`backend/functions/generate-prevention/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { incident_summary, feedback_result }
    # 戻り値: { checklist, flow, deadline, responsible, report_method }

# Bedrock Claude Sonnet で再発防止策を生成する
# 戻り値: dict（checklist / confirmation_flow / deadline / responsible / report_method）
def generate_prevention(incident_summary, feedback_result)
```

---

### GenerateFollowMailLambda (`backend/functions/generate-follow-mail/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { opponent_profile, incident_summary, apology_result }
    # 戻り値: { subject, body, tone_explanation }

# Bedrock Claude Sonnet でフォローメールを生成する（相手タイプに応じた文調）
# 戻り値: dict（subject / body / tone_explanation）
def generate_follow_mail(opponent_profile, incident_summary, apology_result)
```

---

### AnalyzeKarteLambda (`backend/functions/analyze-karte/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { user_id }
    # 戻り値: { ng_word_trends, score_history, weakness_categories, recommendations }

# Bedrock Nova Lite + DynamoDB でカルテ傾向分析を行う
# 戻り値: dict（ng_word_trends / score_history / weakness_categories / recommendations）
def analyze_karte(sessions_data)
```

---

### GenerateGuidanceFeedbackLambda (`backend/functions/generate-guidance-feedback/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { session_id, conversation_history, subordinate_profile, final_scores }
    # 戻り値: { improved_script, problem_phrases, alternative_phrases, score }

# Bedrock Claude Sonnet で指導改善スクリプトを生成する
# 戻り値: dict（improved_script / problem_phrases / alternative_phrases / overall_score）
def generate_guidance_feedback(conversation_history, subordinate_profile, final_scores)
```

---

### TextToSpeechLambda (`backend/functions/text-to-speech/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { text }
    # 戻り値: { audio_base64, visemes: [{time, value}, ...] }

# Polly でMP3音声とSpeechMarksを並列取得する（ThreadPoolExecutor使用）
# 戻り値: (audio_bytes, viseme_list)
def synthesize_with_visemes(text, voice_id="Kazuha")

# SpeechMarks JSONLを viseme [{time, value}] リストに変換する
def parse_speech_marks(speech_marks_response)
```

---

### SaveSessionLambda (`backend/functions/save-session/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { session_id, session_type, data }
    # session_type: "APOLOGY" | "GUIDANCE"
    # 戻り値: { saved: true, session_id }

# セッションサマリーを DynamoDB に保存する
# PK: userId, SK: "SESSION#<timestamp>#<session_id>"
def save_session(user_id, session_id, session_data)

# 会話ターンを DynamoDB に保存する
# PK: userId, SK: "TURN#<session_id>#<turn_number>"
def save_turn(user_id, session_id, turn_number, turn_data)
```

---

### GetKarteLambda (`backend/functions/get-karte/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # query: { session_id? } ← 指定なし=全件一覧, 指定あり=詳細
    # 戻り値: { sessions: [...] } または { session: {...}, turns: [...] }

# ユーザーの全セッション一覧を取得する（新しい順）
# 戻り値: list of session summaries
def list_sessions(user_id)

# 指定セッションの詳細（サマリー＋会話ターン）を取得する
# 戻り値: { session, turns }
def get_session_detail(user_id, session_id)
```

---

### EvaluateGuidanceLambda (`backend/functions/evaluate-guidance/lambda_function.py`)

```python
@handle_errors
def lambda_handler(event, context):
    # body: { guidance_text, subordinate_profile, conversation_history, session_id }
    # 戻り値: { constructiveness_score, harassment_risk, subordinate_reaction,
    #           subordinate_emotion, ng_phrases, response_text }

# Bedrock Nova Lite で指導発言を評価する
# 戻り値: dict（constructiveness_score / harassment_risk / ng_phrases / subordinate_reaction）
def evaluate_guidance(guidance_text, subordinate_profile, conversation_history)

# 部下の感情状態を更新する（30感情から選択）
# 戻り値: emotion_label（30感情ID）
def update_subordinate_emotion(current_emotion, evaluation_result)
```

---

### 共通ユーティリティ

#### ErrorHandlerDecorator (`backend/shared/decorators.py`)

```python
# 全 Lambda に適用する共通エラーハンドリングデコレーター
# Bedrock タイムアウト・DynamoDB エラー等を適切なHTTPレスポンスに変換する
def handle_errors(func):
    # 戻り値: { statusCode, headers: { "Access-Control-Allow-Origin": "*" }, body: json }

# 標準エラーレスポンスを生成する（AGENTS.md パターン準拠）
def error_response(status_code, message)
```

#### InputValidator (`backend/shared/input_validator.py`)

```python
# ユーザー入力テキストを検証する（全Lambda共通の入力バリデーション層）
# max_length: 最大文字数（デフォルト500）
# 戻り値: 検証済みテキスト（問題なければそのまま返却）
# 例外: ValidationError（文字数超過、インジェクション検知時）
def validate_text(text, max_length=500)

# プロンプトインジェクションパターンを検知する
# ブラックリスト: "ignore above", "system:", "You are", "忘れて", "無視して" 等
# 戻り値: bool（検知=True）
def detect_injection(text)

# 入力テキストをサニタイズする（制御文字除去・HTMLタグストリップ）
# 戻り値: サニタイズ済みテキスト
def sanitize_input(text)

# Bedrock呼び出し用にJSON出力を強制するシステムプロンプト接尾辞を生成
# 戻り値: str（"You MUST respond only with valid JSON..." 的な制約文）
def enforce_json_output_suffix()
```

#### PromptLoader (`backend/shared/prompt_loader.py`)

```python
# backend/prompts/<name>.txt を読み込みテンプレートを返す
def load_prompt(prompt_name)

# {{variable_name}} 形式の変数をディクショナリで置換する
# 戻り値: 変数置換済みのプロンプト文字列
def render_prompt(prompt_name, variables)
```

#### BedrockClient (`backend/shared/bedrock_client.py`)

```python
# Nova Lite でメッセージを送信する（会話評価・感情分類用）
# 戻り値: dict（パースされたJSONレスポンス）
def invoke_nova_lite(prompt, system_prompt, max_tokens=1000)

# Claude Sonnet でメッセージを送信する（高品質生成用）
# 戻り値: dict（パースされたJSONレスポンス）
def invoke_claude_sonnet(prompt, system_prompt, max_tokens=2000)
```
