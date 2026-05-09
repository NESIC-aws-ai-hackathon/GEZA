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
  const TODOS_KEY   = "geza_todos";   // { [caseId]: [{id, text, done}] }
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
      // Todoも一緒に削除
      try {
        const allTodos = JSON.parse(localStorage.getItem(TODOS_KEY) || "{}");
        delete allTodos[id];
        localStorage.setItem(TODOS_KEY, JSON.stringify(allTodos));
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }

  // ── Todo ──
  // apologyPlan.todo_list (要素: {task, deadline, priority}) をベースに表示。
  // 完了状態は localStorage "geza_todos" に保存。
  function _loadTodoDone() {
    if (!_case) return {};
    try {
      const all = JSON.parse(localStorage.getItem(TODOS_KEY) || "{}");
      return typeof all[_case.id] === "object" && !Array.isArray(all[_case.id]) ? all[_case.id] : {};
    } catch { return {}; }
  }

  function _saveTodoDone(doneMap) {
    if (!_case) return;
    try {
      const all = JSON.parse(localStorage.getItem(TODOS_KEY) || "{}");
      all[_case.id] = doneMap;
      localStorage.setItem(TODOS_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
  }

  function _getTodoItems() {
    const list = (_case && _case.apologyPlan && Array.isArray(_case.apologyPlan.todo_list))
      ? _case.apologyPlan.todo_list
      : [];
    const doneMap = _loadTodoDone();
    return list.map(function (t, i) {
      const id = "todo_" + i;
      return { id, task: t.task || "", deadline: t.deadline || "", priority: t.priority || "中", done: !!doneMap[id] };
    });
  }

  function _renderTodos() {
    const listEl   = document.getElementById("todo-list");
    const emptyEl  = document.getElementById("todo-empty");
    const badge    = document.getElementById("todo-count-badge");
    const progress = document.getElementById("todo-progress");
    if (!listEl) return;

    const todos = _getTodoItems();
    const total = todos.length;
    const done  = todos.filter(function (t) { return t.done; }).length;

    if (badge)    badge.textContent = total + "件";
    if (progress) progress.textContent = total ? (done + "/" + total + " 完了") : "";

    listEl.textContent = "";
    if (total === 0) {
      const msg = document.createElement("div");
      msg.className = "todo-empty";
      msg.textContent = "謝罪プランに Todo が含まれません";  // XSS-01
      listEl.appendChild(msg);
      return;
    }
    if (emptyEl) emptyEl.remove();

    todos.forEach(function (todo) {
      const item = document.createElement("div");
      item.className = "todo-item" + (todo.done ? " done" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "todo-checkbox";
      cb.checked = todo.done;
      cb.setAttribute("aria-label", todo.task + " 完了トグル");
      cb.addEventListener("change", function () {
        const dm = _loadTodoDone();
        dm[todo.id] = cb.checked;
        _saveTodoDone(dm);
        _renderTodos();
      });

      const txt = document.createElement("div");
      txt.style.flex = "1";
      const taskSpan = document.createElement("span");
      taskSpan.className = "todo-text";
      taskSpan.textContent = todo.task;  // XSS-01
      txt.appendChild(taskSpan);

      if (todo.deadline || todo.priority) {
        const meta = document.createElement("div");
        meta.style.cssText = "font-size:10px;color:#666;margin-top:2px;";
        const parts = [];
        if (todo.deadline) parts.push("期限: " + todo.deadline);
        if (todo.priority) parts.push("優先度: " + todo.priority);
        meta.textContent = parts.join(" / ");  // XSS-01
        txt.appendChild(meta);
      }

      item.appendChild(cb);
      item.appendChild(txt);
      listEl.appendChild(item);
    });
  }

  function _setupTodo() {
    _renderTodos();
    // 入力欄は不要（AI生成Todoのみ表示）ので非表示に
    const addRow = document.getElementById("todo-add-row");
    if (addRow) addRow.style.display = "none";
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

    // フルスクリプト（折りたたみ）
    const fullScript = plan.full_script || "";
    const scriptEl = document.getElementById("plan-full-script");
    if (scriptEl) scriptEl.textContent = fullScript || "（台本データなし）";
    const toggleBtn = document.getElementById("btn-toggle-script");
    const scriptWrap = document.getElementById("plan-full-script-wrap");
    if (toggleBtn && scriptWrap) {
      toggleBtn.textContent = "▶ 謝罪台本全文を見る";
      toggleBtn.addEventListener("click", function () {
        const isOpen = scriptWrap.style.display !== "none";
        scriptWrap.style.display = isOpen ? "none" : "block";
        toggleBtn.textContent = isOpen ? "▶ 謝罪台本全文を見る" : "▼ 閉じる";
      });
    }

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
    if (!_case) {
      alert("案件データが見つかりません。");
      return;
    }
    const op = _case.opponentProfile || {};
    // opponentProfileに少なくともtypeが必要
    if (!op.type && !op.anger_level) {
      alert("相手情報が不完全です。インセプションの最後まで完了してください。");
      return;
    }
    const profile = Object.assign({}, op, {
      faceConfig: _case.faceConfig || null,
    });
    StateManager.setPersistent("opponentProfile", profile);
    StateManager.setPersistent("apologyPlan", _case.apologyPlan || null);
    if (_animator) _animator.stop();
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

  // ── 直前確認 ──
  function _setupPrecheck() {
    const btn = document.getElementById("btn-precheck");
    if (!btn || !_case) return;
    btn.addEventListener("click", function () {
      // プランセクションへスクロールしてハイライト
      const planEl = document.getElementById("plan-section");
      if (planEl) {
        planEl.scrollIntoView({ behavior: "smooth", block: "start" });
        planEl.style.outline = "2px solid #7c3aed";
        setTimeout(function () { planEl.style.outline = ""; }, 1500);
      }
      // プランコンテンツが空の場合はコンシェルジュに直前確認を依頼
      const apPlan = _case.apologyPlan || {};
      if (!apPlan.first_words && !apPlan.timing) {
        const chatInput = document.getElementById("chat-input");
        if (chatInput) {
          chatInput.value = "直前確認をおねがいします。当日のチェックリストを教えてください。";
          chatInput.dispatchEvent(new Event("input"));
          const chatEl = document.querySelector(".concierge-section");
          if (chatEl) chatEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
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
      // 現在のTODOリストを文字列化してコンテキストとして渡す
      const todoItems = _getTodoItems();
      const todoSummary = todoItems.length > 0
        ? todoItems.map((t, i) => `${i + 1}. [${t.priority}] ${t.task}（期限: ${t.deadline}）${t.done ? " ✓完了" : ""}`).join("\n")
        : "（TODOなし）";

      const resp = await ApiClient.post("/plan/consult", {
        incident_summary:     _case ? (_case.enrichedSummary || _case.incidentSummary || "") : "",
        opponent_type:        op.type        || "不明",
        opponent_anger_level: op.anger_level || 50,
        current_plan_summary: plan.first_words || "",
        current_todo_list:    todoSummary,
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
        if (rp.todo_list)   _renderTodos();  // Todo を再描画
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
      let msg;
      if (err && err.message) {
        if (err.message.includes("401")) {
          msg = "セッションが切れました。ページを再読み込みしてください。";
        } else if (err.message.includes("500") || err.message.includes("502") || err.message.includes("503")) {
          msg = "サーバーエラーが発生しました。しばらくしてから再度お試しください。";
        } else {
          msg = "通信エラーが発生しました。インターネット接続をご確認の上、再度お試しください。";
        }
      } else {
        msg = "エラーが発生しました。もう一度お試しください。";
      }
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
    _setupPrecheck();
    _renderPage(_case);
    _setupChat();
    _setupTodo();

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
