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
  let _avatarAnim       = null;
  let _transcribeClient = null;
  let _isRecording      = false;
  let _isPollyPlaying   = false;
  let _ngWordCount      = 0;
  // 音声再生管理（Web Audio API 使用でオートプレイポリシー回避）
  let _audioCtx         = null;  // ユーザージェスチャー時に生成・resume 済み
  let _currentSource    = null;  // AudioBufferSourceNode
  let _visemeTimers     = [];

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
    // AvatarAnimator で自然なアニメーションを開始（startAnimation の代わり）
    if (window.AvatarAnimator) {
      _avatarAnim = window.AvatarAnimator.create(
        "practice-avatar-container",
        _opponentProfile.faceConfig ?? null
      );
      _avatarAnim.start();
    } else {
      AvatarController.startAnimation();
    }

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
  function _handleStart() {
    $btnStart().disabled = true;
    $startOverlay().hidden = true;

    // ユーザージェスチャー内で AudioContext を生成・resume（以降の decodeAudioData/start はポリシー不要）
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        _audioCtx = new AudioCtx();
        _audioCtx.resume().catch(() => {});
      }
    } catch (e) { /* 未対応ブラウザは無視 */ }

    const firstMsg = _apologyPlan?.first_boss_message
                  ?? _opponentProfile?.first_message
                  ?? "さて、何か言いたいことがあるようだな。";

    _appendChatMessage("assistant", firstMsg);

    // TTS完了を待たず入力を即座に有効化
    $apologyInput().disabled = false;
    $btnMic().disabled = false;

    // 表情設定（AvatarAnimator のみ使用。AvatarController.setCategoryEmotion は
    // window.facesjs.display を呼んで SVG を再描画するため mouthWrap が破壊される）
    _setEmotion("frustration");

    // TTSは非同期で起動（失敗しても入力は有効のまま）
    _speakBoss(firstMsg).catch((err) => console.warn("Initial TTS failed:", err));
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

    try {
      _setEmotion("confusion");
      const result = await _callEvaluate(text);
      _applyEvalResult(result, text);
    } catch (err) {
      _applyFallback(err);
    } finally {
      if (StateManager.practice.sessionResult === null) {
        if (StateManager.practice.turnCount >= MAX_TURNS) {
          _handleMaxTurn();
        } else if (!_isPollyPlaying) {
          // TTS 再生中でない場合のみ入力を再有効化（TTS中はpolly自身が完了後に再有効化）
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
      // signal を渡して 9.5s で強制タイムアウト
      const raw = await ApiClient.post("/apology/evaluate", payload, { signal: controller.signal });
      return raw;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function _applyEvalResult(result, userText) {
    StateManager.practice.consecutiveErrors = 0;
    $errorBanner().hidden = true;

    const angerDelta = result.anger_delta ?? 0;

    // スコア更新
    const newAnger = result.anger_level ?? StateManager.practice.currentAngryScore;
    const newTrust = result.trust_level ?? StateManager.practice.currentTrustScore;
    StateManager.practice.currentAngryScore = newAnger;
    StateManager.practice.currentTrustScore = newTrust;
    StateManager.practice.turnCount += 1;
    _updateGauge(newAnger, newTrust, angerDelta);

    // 感情表情（AvatarAnimator のみ、SVG 再描画なし）
    if (result.emotion_label) {
      _setEmotion(result.emotion_label);
    }

    // チャット表示
    const responseText = result.response_text ?? "";
    _appendChatMessage(
      "assistant",
      responseText,
      result.follow_up_question ?? null,
      result.is_fallback ?? false
    );

    // NG ワード（ユーザーの謝罪文に実際に含まれる語句のみ表示）
    if (result.ng_words?.length && userText) {
      const filtered = result.ng_words.filter(ng =>
        ng.word && userText.includes(ng.word)
      );
      if (filtered.length) {
        _ngWordCount += filtered.length;
        _renderNgWords(filtered);
      }
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

  // ── 表情設定ヘルパー（SVG再描画なし。AvatarController は使わない）─────────────
  function _setEmotion(label) {
    if (_avatarAnim) {
      try { _avatarAnim.setCategoryEmotion(label); } catch (e) { /* ignore */ }
    }
    // AvatarController.setCategoryEmotion は window.facesjs.display で SVG を再描画し
    // AvatarAnimator の mouthWrap 等の DOM 参照を破壊するため、ここでは呼ばない。
  }

  // ── TTS ＋ リップシンク（プロトタイプ準拠の直接 audio 再生）──────────────────
  async function _speakBoss(text) {
    if (!text) return;
    _isPollyPlaying = true;
    $btnSubmit().disabled = true;
    $btnMic().disabled    = true;
    $apologyInput().disabled = true;
    try {
      const voiceId = (_opponentProfile?.gender === "female") ? "Kazuha" : "Takumi";
      const ttsCtrl = new AbortController();
      const ttsTimer = setTimeout(() => ttsCtrl.abort(), 8000);
      let ttsResult;
      try {
        ttsResult = await ApiClient.post("/tts/synthesize", { text, voice_id: voiceId }, { signal: ttsCtrl.signal });
      } finally {
        clearTimeout(ttsTimer);
      }
      await _playAudioWithVisemes(ttsResult.audio_base64, ttsResult.visemes ?? []);
    } catch (err) {
      console.warn("TTS failed, continuing without audio:", err);
    } finally {
      _isPollyPlaying = false;
      if (StateManager.practice.sessionResult === null) {
        $apologyInput().disabled = false;
        $btnMic().disabled       = false;
        $btnSubmit().disabled    = !$apologyInput().value.trim();
      }
    }
  }

  // Web Audio API で MP3 を再生しつつ viseme タイムコードで口パク
  // AudioContext.resume() 済みなのでオートプレイポリシーを回避できる
  function _playAudioWithVisemes(base64Data, visemes) {
    return new Promise(function (resolve, reject) {
      // 前の再生を停止
      if (_currentSource) {
        try { _currentSource.stop(); } catch (e) { /**/ }
        _currentSource = null;
      }
      _clearVisemeTimers();

      if (!_audioCtx) {
        reject(new Error("AudioContext not initialized"));
        return;
      }

      // suspended なら resume してから再生（バックグラウンドから戻った場合など）
      var resumeP = (_audioCtx.state === "suspended") ? _audioCtx.resume() : Promise.resolve();
      resumeP.then(function () {
        var binary = atob(base64Data);
        var bytes  = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        _audioCtx.decodeAudioData(bytes.buffer, function (audioBuffer) {
          var src = _audioCtx.createBufferSource();
          src.buffer = audioBuffer;
          src.connect(_audioCtx.destination);

          src.onended = function () {
            if (_currentSource === src) _currentSource = null;
            _clearVisemeTimers();
            if (_avatarAnim) {
              try { _avatarAnim.setMouthViseme("sil"); } catch (e) { /**/ }
              try { _avatarAnim.setSpeaking(false); } catch (e) { /**/ }
            }
            resolve();
          };

          _currentSource = src;
          if (_avatarAnim) { try { _avatarAnim.setSpeaking(true); } catch (e) { /**/ } }

          // start(0) と同時に startTime を取得して viseme をスケジュール
          src.start(0);
          var startTime = performance.now();
          _scheduleVisemes(visemes, startTime);

        }, function (decodeErr) {
          reject(decodeErr);
        });
      }).catch(reject);
    });
  }

  // visemes を startTime 基準で全件いっせいにスケジュール（再帰なし・ドリフトなし）
  function _scheduleVisemes(visemes, startTime) {
    _clearVisemeTimers();
    if (!visemes || visemes.length === 0 || !_avatarAnim) return;
    var base = (startTime !== undefined) ? startTime : performance.now();
    for (var i = 0; i < visemes.length; i++) {
      (function (v) {
        var delay = Math.max(0, v.time - (performance.now() - base));
        var id = setTimeout(function () {
          if (_avatarAnim) { try { _avatarAnim.setMouthViseme(v.value); } catch (e) { /**/ } }
        }, delay);
        _visemeTimers.push(id);
      })(visemes[i]);
    }
  }

  function _clearVisemeTimers() {
    _visemeTimers.forEach(clearTimeout);
    _visemeTimers = [];
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
    // Web Speech API があればそちらを優先（iOS Safari / Android Chrome 対応）
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      _startWebSpeech();
      return;
    }
    // フォールバック: Amazon Transcribe Streaming
    try {
      _transcribeClient = new TranscribeClient();
      $btnMic().classList.add("recording");
      $btnMic().title = "録音停止";
      $micLabel().textContent = "録音中... 3秒間の無音で自動停止";
      _isRecording = true;
      await _transcribeClient.startStreaming((text, isFinal) => {
        $apologyInput().value = text;
        $btnSubmit().disabled = !text.trim();
        if (isFinal) _stopRecording();
      });
    } catch (err) {
      console.warn("Transcribe failed:", err);
      _stopRecording();
      $micLabel().textContent = "音声入力を利用できません。テキスト入力をご使用ください。";
    }
  }

  function _startWebSpeech() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRec();
    recog.lang = "ja-JP";
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;

    $btnMic().classList.add("recording");
    $btnMic().title = "録音停止";
    $micLabel().textContent = "録音中...";
    _isRecording = true;

    recog.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      $apologyInput().value = final || interim;
      $btnSubmit().disabled = !$apologyInput().value.trim();
    };

    recog.onerror = (e) => {
      console.warn("Web Speech error:", e.error);
      _stopRecording();
      if (e.error === "not-allowed") {
        $micLabel().textContent = "マイクの使用が許可されていません。設定をご確認ください。";
      } else {
        $micLabel().textContent = "音声認識エラー。テキスト入力をご使用ください。";
      }
    };

    recog.onend = () => {
      _stopRecording();
      // 音声認識後テキストがあれば自動送信（自然な会話フロー）
      const txt = $apologyInput().value.trim();
      if (txt && !_isPollyPlaying) {
        setTimeout(_handleSubmit, 300); // 認識結果確定のため微小遅延
      }
    };

    recog.start();
    // stop用に保持
    _transcribeClient = { stop: () => { try { recog.stop(); } catch { /* ignore */ } } };
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
      _setEmotion("satisfaction");
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

  function _updateGauge(anger, trust, angerDelta) {
    $angerValue().textContent = anger;
    $trustValue().textContent = trust;

    // クリティカル謝罪（anger_delta ≤ -15）: エフェクト付きメーター演出
    const isCritical = (typeof angerDelta === "number" && angerDelta <= -15);
    if (isCritical) {
      // 怒りバーにクリティカルアニメ（CSSクラスで）
      const bar = $angerBar();
      bar.classList.remove("anger-bar-critical");
      // リフローを強制するために指定一度読み込む
      void bar.offsetWidth;
      bar.classList.add("anger-bar-critical");
      bar.addEventListener("animationend", () => bar.classList.remove("anger-bar-critical"), { once: true });

      // 画面フラッシュエフェクト
      const flash = document.getElementById("critical-flash");
      if (flash) {
        flash.classList.remove("active");
        void flash.offsetWidth;
        flash.classList.add("active");
        flash.addEventListener("animationend", () => flash.classList.remove("active"), { once: true });
      }

      // 怒りメーターラベルに一瞬表示
      const meta = $gaugeMeta();
      const prev = meta.textContent;
      meta.textContent = `✨ クリティカル！怒り -${Math.abs(angerDelta)}`;
      meta.style.color = "#2ecc71";
      meta.style.fontWeight = "700";
      setTimeout(() => {
        meta.textContent = prev;
        meta.style.color = "";
        meta.style.fontWeight = "";
        _updateGaugeMeta();
      }, 2000);
    }

    $angerBar().style.width = `${anger}%`;
    $trustBar().style.width = `${trust}%`;
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
