/**
 * case-detail.js — GEZA 案件詳細ページコントローラー
 *
 * sessionStorage "geza_current_case_id" から案件IDを読み、
 * localStorage "geza_cases" から案件データを取得して表示する。
 *
 * XSS-01 準拠: ユーザーデータは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  const STORAGE_KEY = "geza_cases";
  const MAX_TURNS   = 10;

  // ── 状態 ──
  let _case = null;
  let _conversationHistory = [];
  let _isSending = false;
  let _animator  = null;

  // ── データ操作 ──
  function _loadCase(id) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cases = raw ? JSON.parse(raw) : [];
      return cases.find((c) => c.id === id) || null;
    } catch { return null; }
  }

  function _deleteCase(id) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cases = raw ? JSON.parse(raw) : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cases.filter((c) => c.id !== id)));
    } catch { /* ignore */ }
  }

  // ── ページ描画 ──
  function _renderPage(c) {
    const op = c.opponentProfile || {};
    const plan = c.apologyPlan || {};

    // タイトル
    const titleEl = document.getElementById("case-title");
    if (titleEl) {
      const txt = c.incidentSummary || (op.type ? op.type + " への謝罪" : "謝罪案件");
      titleEl.textContent = txt.slice(0, 40) + (txt.length > 40 ? "…" : "");  // XSS-01
    }

    // バッジ
    const badges = document.getElementById("case-badges");
    if (badges) {
      badges.textContent = "";
      if (op.type) {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = op.type;
        badges.appendChild(b);
      }
      if (op.anger_level != null) {
        const b = document.createElement("span");
        b.className = "badge anger";
        b.textContent = "怒り " + op.anger_level + "%";
        badges.appendChild(b);
      }
      if (op.trust_level != null) {
        const b = document.createElement("span");
        b.className = "badge trust";
        b.textContent = "信頼 " + op.trust_level + "%";
        badges.appendChild(b);
      }
    }

    // サマリー
    const sumEl = document.getElementById("case-summary");
    if (sumEl) sumEl.textContent = c.enrichedSummary || c.incidentSummary || "";  // XSS-01

    // プランカード
    _setText("plan-first-words", plan.first_words || "（未設定）");
    _setText("plan-timing",      plan.timing      || "（未設定）");
    _setText("plan-gift",        plan.gift         || "（未設定）");

    // アバター描画
    _initAvatar(c);
  }

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;  // XSS-01
  }

  // ── アバター ──
  function _initAvatar(c) {
    if (!window.facesjs) return;
    try {
      let faceConfig = c.faceConfig || null;
      if (!faceConfig) {
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        faceConfig = window.facesjs.generate({ seed: arr[0] });
      }

      window.facesjs.display("case-boss-avatar", faceConfig);

      const container = document.getElementById("case-boss-avatar");
      const svg = container && container.querySelector("svg");
      if (svg) {
        svg.setAttribute("preserveAspectRatio", "xMidYMin slice");
        svg.style.width  = "100%";
        svg.style.height = "100%";
      }

      // アニメーション開始
      setTimeout(function () {
        if (window.AvatarAnimator) {
          _animator = window.AvatarAnimator.create("case-boss-avatar", faceConfig);
          _animator.start();
        }
      }, 400);
    } catch (e) {
      console.warn("Avatar init error:", e);
    }
  }

  // ── リハーサル起動 ──
  function _launchRehearsal() {
    if (!_case || !_case.opponentProfile) {
      alert("案件データが不完全です。");
      return;
    }
    const profile = Object.assign({}, _case.opponentProfile, {
      faceConfig: _case.faceConfig || null,
    });
    StateManager.setPersistent("opponentProfile", profile);
    StateManager.setPersistent("apologyPlan", _case.apologyPlan || null);
    window.location.assign("practice.html");
  }

  // ── 削除モーダル ──
  function _setupDeleteModal() {
    const modal     = document.getElementById("delete-modal");
    const btnDelete = document.getElementById("btn-delete");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnConfirm = document.getElementById("btn-modal-delete");

    if (btnDelete) {
      btnDelete.addEventListener("click", function () {
        if (modal) modal.classList.add("visible");
      });
    }
    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        if (modal) modal.classList.remove("visible");
      });
    }
    if (btnConfirm) {
      btnConfirm.addEventListener("click", function () {
        if (_case) {
          if (_animator) _animator.stop();
          _deleteCase(_case.id);
        }
        window.location.assign("dashboard.html");
      });
    }
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) modal.classList.remove("visible");
      });
    }
  }

  // ── コンシェルジュチャット ──
  function _appendBubble(role, text) {
    const area = document.getElementById("chat-messages");
    if (!area) return;
    const div = document.createElement("div");
    div.className = "consult-bubble " + role;
    div.textContent = text;  // XSS-01
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  }

  function _showThinking() {
    const area = document.getElementById("chat-messages");
    if (!area) return null;
    const div = document.createElement("div");
    div.id = "thinking-indicator";
    div.className = "chat-thinking";
    for (var i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "thinking-dot";
      div.appendChild(dot);
    }
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    return div;
  }

  function _removeThinking() {
    const el = document.getElementById("thinking-indicator");
    if (el) el.remove();
  }

  function _updateTurnLabel() {
    const label = document.getElementById("chat-turn-label");
    if (!label) return;
    const used = _conversationHistory.filter((m) => m.role === "user").length;
    const remaining = MAX_TURNS - used;
    label.textContent = remaining > 0 ? ("残り " + remaining + " 回") : "";
  }

  function _setLoading(isLoading) {
    const btn     = document.getElementById("btn-chat-send");
    const label   = document.getElementById("send-label");
    const spinner = document.getElementById("send-spinner");
    if (btn)     btn.disabled          = isLoading;
    if (label)   label.style.opacity   = isLoading ? "0" : "1";
    if (spinner) spinner.style.display = isLoading ? "inline-block" : "none";
  }

  async function _sendMessage() {
    if (_isSending) return;
    const input = document.getElementById("chat-input");
    const text  = (input ? input.value : "").trim();
    if (!text) return;

    const userTurns = _conversationHistory.filter((m) => m.role === "user").length;
    if (userTurns >= MAX_TURNS) {
      _appendBubble("assistant", "チャットの最大ターン数に達しました。");
      return;
    }

    _isSending = true;
    if (input) input.value = "";
    _setLoading(true);
    _appendBubble("user", text);
    _showThinking();
    _updateTurnLabel();

    const op   = (_case && _case.opponentProfile) || {};
    const plan = (_case && _case.apologyPlan)     || {};
    const histCopy = _conversationHistory.slice();

    try {
      const resp = await ApiClient.post("/plan/consult", {
        incident_summary:     _case ? (_case.enrichedSummary || _case.incidentSummary || "") : "",
        opponent_type:        op.type        || "不明",
        opponent_anger_level: op.anger_level || 50,
        current_plan_summary: plan.first_words || "",
        conversation_history: histCopy,
        user_message:         text,
      });

      _removeThinking();
      const advice = resp && resp.advice ? resp.advice : "うまく応答できませんでした。";
      _conversationHistory.push({ role: "user",      content: text });
      _conversationHistory.push({ role: "assistant", content: advice });
      _appendBubble("assistant", advice);

      // revised_plan がある場合はプランカードを更新
      if (resp && resp.revised_plan && _case) {
        const rp = resp.revised_plan;
        Object.assign(_case.apologyPlan, rp);
        if (rp.first_words) _setText("plan-first-words", rp.first_words);
        if (rp.timing)      _setText("plan-timing",      rp.timing);
        if (rp.gift)        _setText("plan-gift",        rp.gift);
        // localStorageも更新
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const cases = raw ? JSON.parse(raw) : [];
          const idx = cases.findIndex((c) => c.id === _case.id);
          if (idx >= 0) {
            cases[idx].apologyPlan = _case.apologyPlan;
            cases[idx].updatedAt = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      _removeThinking();
      const msg = (err && err.message && err.message.includes("401"))
        ? "セッションが切れました。ページを再読み込みしてください。"
        : "エラーが発生しました。もう一度お試しください。";
      _appendBubble("assistant", msg);
    } finally {
      _isSending = false;
      _setLoading(false);
      _updateTurnLabel();
    }
  }

  function _setupChat() {
    const sendBtn = document.getElementById("btn-chat-send");
    const input   = document.getElementById("chat-input");

    if (sendBtn) sendBtn.addEventListener("click", _sendMessage);

    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          _sendMessage();
        }
      });
      input.addEventListener("input", function () {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 100) + "px";
      });
    }

    _updateTurnLabel();
  }

  // ── ナビゲーション ──
  function _setupNavigation() {
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (_animator) _animator.stop();
        window.location.assign("dashboard.html");
      });
    }

    const btnRehearsal = document.getElementById("btn-rehearsal");
    if (btnRehearsal) {
      btnRehearsal.addEventListener("click", _launchRehearsal);
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try { await AuthModule.logout(); } catch { /* ignore */ }
        window.location.assign("../index.html");
      });
    }
  }

  // ── 初期化 ──
  async function init() {
    if (!AuthModule.requireAuth()) return;

    const caseId = sessionStorage.getItem("geza_current_case_id");
    if (!caseId) {
      window.location.assign("dashboard.html");
      return;
    }

    _case = _loadCase(caseId);
    if (!_case) {
      window.location.assign("dashboard.html");
      return;
    }

    _setupNavigation();
    _setupDeleteModal();
    _renderPage(_case);
    _setupChat();

    // 初回挨拶
    setTimeout(function () {
      const op = _case.opponentProfile || {};
      const greeting = "この案件（" + (op.type || "相手") + "）について何でも相談してください。\n" +
        "プランの調整や当日の注意点など、アドバイスします。";
      _appendBubble("assistant", greeting);
      _updateTurnLabel();
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
