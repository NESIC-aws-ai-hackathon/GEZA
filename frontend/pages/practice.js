/**
 * practice.js — GEZA PracticePageController（U3）
 *
 * 依存: config.js / auth.js / state.js / api.js / avatar.js /
 *       transcribe.js / polly-sync.js / facesjs.min.js
 * XSS-01: AI 生成テキストは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  const MAX_TURNS = 10;
  const CLEAR_TRUST_THRESHOLD = 80;
  const CLEAR_ANGER_THRESHOLD = 20;

  // ── 状態 ──────────────────────────────────────────────────────────────────
  let _opponentProfile  = null;
  let _apologyPlan      = null;
  let _pollySyncCtrl    = null;
  let _transcribeClient = null;
  let _isRecording      = false;
  let _isPollyPlaying   = false;
  let _ngWordCount      = 0;

  // ── DOM 参照 ──────────────────────────────────────────────────────────────
  const $apologyInput    = () => document.getElementById("apology-input");
  const $btnSubmit       = () => document.getElementById("btn-submit");
  const $btnMic          = () => document.getElementById("btn-mic");
  const $btnEnd          = () => document.getElementById("btn-end");
  const $chatArea        = () => document.getElementById("chat-area");
  const $angerValue      = () => document.getElementById("anger-value");
  const $angerBar        = () => document.getElementById("anger-bar");
  const $trustValue      = () => document.getElementById("trust-value");
  const $trustBar        = () => document.getElementById("trust-bar");
  const $gaugeMeta       = () => document.getElementById("gauge-meta");
  const $errorBanner     = () => document.getElementById("error-banner");
  const $errorMessage    = () => document.getElementById("error-message");
  const $btnRetry        = () => document.getElementById("btn-retry");
  const $startOverlay    = () => document.getElementById("start-overlay");
  const $startOpponentDesc = () => document.getElementById("start-opponent-desc");
  const $btnStart        = () => document.getElementById("btn-start");
  const $clearOverlay    = () => document.getElementById("clear-overlay");
  const $btnToFeedback   = () => document.getElementById("btn-to-feedback");
  const $maxTurnBanner   = () => document.getElementById("max-turn-banner");
  const $micLabel        = () => document.getElementById("mic-label");

  // ── 初期化 ────────────────────────────────────────────────────────────────
  async function init() {
    if (!AuthModule.requireAuth()) return;

    // sessionStorage からデータ読み取り
    _opponentProfile = StateManager.getPersistent("opponentProfile");
    _apologyPlan     = StateManager.getPersistent("apologyPlan");

    if (!_opponentProfile) {
      _showNoDataMessage();
      return;
    }

    // StateManager.practice 初期化
    StateManager.practice.conversationHistory = [];
    StateManager.practice.currentAngryScore   = _opponentProfile.anger_level ?? 65;
    StateManager.practice.currentTrustScore   = _opponentProfile.trust_level ?? 30;
    StateManager.practice.turnCount           = 0;
    StateManager.practice.consecutiveErrors   = 0;
    StateManager.practice.sessionResult       = null;
    StateManager.practice.sessionId           = crypto.randomUUID();
    _ngWordCount = 0;

    // アバター初期化
    AvatarController.init("practice-avatar-container", _opponentProfile.faceConfig ?? null);
    AvatarController.startAnimation();

    // Polly 同期コントローラー初期化
    _pollySyncCtrl = new PollySyncController(AvatarController);

    // ゲージ初期表示
    _updateGauge(
      StateManager.practice.currentAngryScore,
      StateManager.practice.currentTrustScore
    );

    // 相手の説明文を開始オーバーレイに表示
    const desc = _opponentProfile.type ?? "相手の情報あり";
    $startOpponentDesc().textContent = `相手: ${desc}`;

    // イベントバインド
    $btnStart().addEventListener("click", _handleStart);
    $btnEnd().addEventListener("click", _handleEndConfirm);
    $btnSubmit().addEventListener("click", _handleSubmit);
    $btnMic().addEventListener("click", _toggleMic);
    $btnRetry().addEventListener("click", _handleRetry);
    $btnToFeedback().addEventListener("click", () => {
      window.location.href = "feedback.html";
    });
    $apologyInput().addEventListener("input", () => {
      $btnSubmit().disabled = !$apologyInput().value.trim() || _isPollyPlaying;
    });
  }

  // ── 開始ボタン押下 ─────────────────────────────────────────────────────────
  async function _handleStart() {
    $btnStart().disabled = true;
    $startOverlay().hidden = true;

    // first_message があれば TTS 再生
    const firstMsg = _apologyPlan?.first_boss_message
                  ?? _opponentProfile?.first_message
                  ?? "さて、何か言いたいことがあるようだな。";

    _appendChatMessage("assistant", firstMsg);
    await _speakBoss(firstMsg);

    // 入力有効化
    $apologyInput().disabled = false;
    $btnMic().disabled = false;
  }

  // ── 送信ボタン押下 ─────────────────────────────────────────────────────────
  async function _handleSubmit() {
    const text = $apologyInput().value.trim();
    if (!text) return;

    $apologyInput().value = "";
    $btnSubmit().disabled = true;
    $btnMic().disabled    = true;
    $apologyInput().disabled = true;

    _appendChatMessage("user", text);
    StateManager.practice.conversationHistory.push({
      role: "user", content: text, timestamp: Date.now(),
    });

    AvatarController.setCategoryEmotion("confusion");

    try {
      const result = await _callEvaluate(text);
      _applyEvalResult(result);
    } catch (err) {
      _applyFallback(err);
    } finally {
      if (StateManager.practice.sessionResult === null) {
        if (StateManager.practice.turnCount >= MAX_TURNS) {
          _handleMaxTurn();
        } else {
          $apologyInput().disabled = false;
          $btnMic().disabled = false;
          $apologyInput().value = "";
          $btnSubmit().disabled = true;
        }
      }
    }
  }

  async function _callEvaluate(text) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 9500);
    try {
      const payload = {
        apology_text:          text,
        opponent_profile:      _opponentProfile,
        conversation_history:  StateManager.practice.conversationHistory.slice(-10),
        session_id:            StateManager.practice.sessionId,
      };
      const raw = await ApiClient.post("/apology/evaluate", payload);
      return raw;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function _applyEvalResult(result) {
    StateManager.practice.consecutiveErrors = 0;
    $errorBanner().hidden = true;

    // スコア更新
    const newAnger = result.anger_level ?? StateManager.practice.currentAngryScore;
    const newTrust = result.trust_level ?? StateManager.practice.currentTrustScore;
    StateManager.practice.currentAngryScore = newAnger;
    StateManager.practice.currentTrustScore = newTrust;
    StateManager.practice.turnCount += 1;
    _updateGauge(newAnger, newTrust);

    // 感情表情
    if (result.emotion_label) AvatarController.setCategoryEmotion(result.emotion_label);

    // チャット表示
    const responseText = result.response_text ?? "";
    _appendChatMessage(
      "assistant",
      responseText,
      result.follow_up_question ?? null,
      result.is_fallback ?? false
    );

    // NG ワード
    if (result.ng_words?.length) {
      _ngWordCount += result.ng_words.length;
      _renderNgWords(result.ng_words);
    }
    _updateGaugeMeta();

    // 会話履歴に追加
    StateManager.practice.conversationHistory.push({
      role:             "assistant",
      content:          responseText,
      emotion_label:    result.emotion_label ?? null,
      anger_level:      newAnger,
      trust_level:      newTrust,
      ng_words:         result.ng_words ?? [],
      follow_up_question: result.follow_up_question ?? null,
      timestamp:        Date.now(),
    });

    // TTS 再生（非同期。完了まで入力 disabled）
    _speakBoss(responseText).then(() => {
      _checkClear();
    });
  }

  function _applyFallback(err) {
    console.warn("evaluate-apology error:", err);
    StateManager.practice.consecutiveErrors += 1;

    if (StateManager.practice.consecutiveErrors >= 2) {
      $errorBanner().hidden = false;
      $errorMessage().textContent = "通信エラーが発生しています。少し時間をおいてから再試行してください。";
      return;
    }

    // 1回目: 固定フォールバック返答
    const fallbackText = "少し考えさせてください…";
    _appendChatMessage("assistant", fallbackText, null, true);
    StateManager.practice.turnCount += 1;
    _updateGaugeMeta();
    StateManager.practice.conversationHistory.push({
      role: "assistant", content: fallbackText, timestamp: Date.now(),
    });
  }

  function _handleRetry() {
    StateManager.practice.consecutiveErrors = 0;
    $errorBanner().hidden = true;
    $apologyInput().disabled = false;
    $btnMic().disabled = false;
  }

  // ── Polly TTS ────────────────────────────────────────────────────────────
  async function _speakBoss(text) {
    if (!text || !_pollySyncCtrl) return;
    _isPollyPlaying = true;
    $btnSubmit().disabled = true;
    $btnMic().disabled    = true;
    $apologyInput().disabled = true;
    try {
      const voiceId = (_opponentProfile?.gender === "female") ? "Kazuha" : "Takumi";
      const ttsResult = await ApiClient.post("/tts/synthesize", { text, voice_id: voiceId });
      await _pollySyncCtrl.playWithSync(ttsResult.audio_base64, ttsResult.visemes ?? []);
    } catch (err) {
      console.warn("TTS failed, continuing without audio:", err);
    } finally {
      _isPollyPlaying = false;
    }
  }

  // ── 音声入力トグル ────────────────────────────────────────────────────────
  async function _toggleMic() {
    if (_isPollyPlaying) return;
    if (_isRecording) {
      _stopRecording();
    } else {
      await _startRecording();
    }
  }

  async function _startRecording() {
    try {
      _transcribeClient = new TranscribeClient();
      $btnMic().classList.add("recording");
      $btnMic().title = "録音停止";
      $micLabel().textContent = "録音中... 3秒間の無音で自動停止";
      _isRecording = true;
      await _transcribeClient.startStreaming((text, isFinal) => {
        $apologyInput().value = text;
        $btnSubmit().disabled = !text.trim();
        if (isFinal) {
          _stopRecording();
        }
      });
    } catch (err) {
      console.warn("Transcribe failed:", err);
      _stopRecording();
      $micLabel().textContent = "音声入力を利用できません。テキスト入力をご使用ください。";
    }
  }

  function _stopRecording() {
    if (_transcribeClient) {
      _transcribeClient.stop();
      _transcribeClient = null;
    }
    $btnMic().classList.remove("recording");
    $btnMic().title = "音声入力";
    $micLabel().textContent = "";
    _isRecording = false;
  }

  // ── クリア判定 ────────────────────────────────────────────────────────────
  function _checkClear() {
    const { currentAngryScore, currentTrustScore } = StateManager.practice;
    if (currentTrustScore >= CLEAR_TRUST_THRESHOLD && currentAngryScore <= CLEAR_ANGER_THRESHOLD) {
      StateManager.practice.sessionResult = "clear";
      $clearOverlay().hidden = false;
      AvatarController.setCategoryEmotion("satisfaction");
      _saveResultToStorage("clear");
    }
  }

  // ── 最大ターン ─────────────────────────────────────────────────────────────
  function _handleMaxTurn() {
    $maxTurnBanner().hidden = false;
    StateManager.practice.sessionResult = "give_up";
    $apologyInput().disabled = true;
    $btnMic().disabled       = true;
    $btnSubmit().disabled    = true;
    _saveResultToStorage("give_up");
    setTimeout(() => { window.location.href = "feedback.html"; }, 3000);
  }

  // ── 手動終了 ──────────────────────────────────────────────────────────────
  function _handleEndConfirm() {
    if (!confirm("練習を終了して、フィードバックを確認しますか？")) return;
    StateManager.practice.sessionResult = "give_up";
    _saveResultToStorage("give_up");
    window.location.href = "feedback.html";
  }

  // ── sessionStorage 保存 ───────────────────────────────────────────────────
  function _saveResultToStorage(resultType) {
    const data = {
      finalAngryScore:      StateManager.practice.currentAngryScore,
      finalTrustScore:      StateManager.practice.currentTrustScore,
      turnCount:            StateManager.practice.turnCount,
      ngWordCount:          _ngWordCount,
      conversationHistory:  StateManager.practice.conversationHistory,
      opponentProfile:      _opponentProfile,
      sessionResult:        resultType,
    };
    StateManager.setPersistent("practiceResult", data);
  }

  // ── UI ヘルパー ───────────────────────────────────────────────────────────
  function _appendChatMessage(role, text, followUp, isFallback) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}${isFallback ? " fallback" : ""}`;
    const p = document.createElement("p");
    p.textContent = text;
    bubble.appendChild(p);
    if (followUp) {
      const fq = document.createElement("p");
      fq.className = "follow-up";
      fq.textContent = `💬 ${followUp}`;
      bubble.appendChild(fq);
    }
    $chatArea().appendChild(bubble);
    bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function _renderNgWords(ngWords) {
    const container = document.createElement("div");
    container.className = "ng-word-highlight";
    ngWords.forEach((ng) => {
      const item = document.createElement("p");
      item.textContent = `⚠️ NG: 「${ng.word}」 — ${ng.reason}。代替: ${ng.alternative}`;
      container.appendChild(item);
    });
    $chatArea().appendChild(container);
    container.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function _updateGauge(anger, trust) {
    $angerValue().textContent = anger;
    $angerBar().style.width   = `${anger}%`;
    $trustValue().textContent = trust;
    $trustBar().style.width   = `${trust}%`;
  }

  function _updateGaugeMeta() {
    $gaugeMeta().textContent = `ターン: ${StateManager.practice.turnCount} / NG: ${_ngWordCount}件`;
  }

  function _showNoDataMessage() {
    $startOverlay().hidden = false;
    const p = document.createElement("p");
    p.textContent = "まず謝罪プランを作成してください。";
    $startOverlay().insertBefore(p, $btnStart());
    $startOpponentDesc().textContent = "データなし";
    $btnStart().textContent = "プランを作成する";
    $btnStart().addEventListener("click", () => {
      window.location.href = "inception.html";
    });
  }

  // ── エントリポイント ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
