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
      // 削除済みリストに追加（API再取得時にも非表示にするため）
      try {
        const deletedIds = JSON.parse(localStorage.getItem("geza_deleted_cases") || "[]");
        if (!deletedIds.includes(id)) {
          deletedIds.push(id);
          localStorage.setItem("geza_deleted_cases", JSON.stringify(deletedIds));
        }
      } catch { /* ignore */ }
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
    const progress = document.getElementById("todo-progress");
    const todoDot  = document.getElementById("todo-dot");
    if (!listEl) return;

    const todos = _getTodoItems();
    const total = todos.length;
    const done  = todos.filter(function (t) { return t.done; }).length;

    if (progress) progress.textContent = total ? (done + "/" + total) : "";
    if (todoDot) {
      if (total > 0 && done === total) todoDot.classList.replace("active", "done");
      else if (todoDot.classList.contains("done")) todoDot.classList.replace("done", "active");
    }

    listEl.textContent = "";
    if (total === 0) {
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:12px;color:#555;text-align:center;padding:10px 0;";
      msg.textContent = "謝罪プランにTodoが含まれません";
      listEl.appendChild(msg);
      return;
    }

    todos.forEach(function (todo, idx) {
      const item = document.createElement("div");
      item.className = "todo-item" + (todo.done ? " done" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "todo-checkbox";
      cb.checked = todo.done;
      cb.setAttribute("aria-label", todo.task + " 完了トグル");
      cb.addEventListener("change", function (e) {
        e.stopPropagation();
        const dm = _loadTodoDone();
        dm[todo.id] = cb.checked;
        _saveTodoDone(dm);
        _renderTodos();
      });

      const main = document.createElement("div");
      main.className = "todo-main";
      const taskSpan = document.createElement("span");
      taskSpan.className = "todo-text";
      taskSpan.textContent = todo.task;
      main.appendChild(taskSpan);

      if (todo.deadline || todo.priority) {
        const meta = document.createElement("div");
        meta.className = "todo-meta";
        const parts = [];
        if (todo.deadline) parts.push("期限: " + todo.deadline);
        if (todo.priority) parts.push(todo.priority);
        meta.textContent = parts.join(" / ");
        main.appendChild(meta);
      }

      // 展開可能な詳細エリア
      const detail = document.createElement("div");
      detail.className = "todo-detail";
      detail.id = "todo-detail-" + idx;

      const detailText = document.createElement("div");
      detailText.style.cssText = "font-size:11px;color:#999;margin-bottom:6px;";
      detailText.textContent = "このタスクについてコンシェルジュに相談できます";
      detail.appendChild(detailText);

      const chatRow = document.createElement("div");
      chatRow.className = "todo-detail-chat";
      const chatInput = document.createElement("input");
      chatInput.type = "text";
      chatInput.className = "todo-detail-input";
      chatInput.placeholder = "例: このタスクの進め方は？";
      chatInput.maxLength = 200;
      const chatSend = document.createElement("button");
      chatSend.type = "button";
      chatSend.className = "todo-detail-send";
      chatSend.textContent = "相談";
      chatSend.addEventListener("click", function () {
        const q = chatInput.value.trim();
        if (!q) return;
        // メインのコンシェルジュにTodo文脈付きで送信
        const chatInputMain = document.getElementById("chat-input");
        if (chatInputMain) {
          chatInputMain.value = "【Todo: " + todo.task + "】" + q;
          chatInputMain.dispatchEvent(new Event("input"));
          _sendMessage();
        }
        chatInput.value = "";
        // コンシェルジュセクションまでスクロール
        var concierge = document.querySelector(".concierge-section");
        if (concierge) concierge.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      chatRow.appendChild(chatInput);
      chatRow.appendChild(chatSend);
      detail.appendChild(chatRow);
      main.appendChild(detail);

      // クリックで展開/折りたたみ
      item.addEventListener("click", function (e) {
        if (e.target.tagName === "INPUT") return;
        const isOpen = detail.classList.contains("open");
        // 他の全てを閉じる
        document.querySelectorAll(".todo-detail.open").forEach(function (el) {
          el.classList.remove("open");
        });
        if (!isOpen) detail.classList.add("open");
      });

      item.appendChild(cb);
      item.appendChild(main);
      listEl.appendChild(item);
    });
  }

  function _setupTodo() {
    _renderTodos();
  }

  // ── タイムライン折りたたみ ──
  function _setupTimeline() {
    document.querySelectorAll(".timeline-header[data-toggle]").forEach(function (header) {
      header.addEventListener("click", function () {
        var targetId = header.dataset.toggle;
        var body = document.getElementById(targetId);
        var icon = header.querySelector(".timeline-expand-icon");
        if (!body) return;
        var isCollapsed = body.classList.contains("collapsed");
        if (isCollapsed) {
          body.classList.remove("collapsed");
          if (icon) icon.textContent = "▼";
        } else {
          body.classList.add("collapsed");
          if (icon) icon.textContent = "▶";
        }
      });
    });
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

  // ── 直前確認 ── （削除済み）

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

      // メールスレッドの要約を生成
      let mailSummary = "(メールやり取りなし)";
      try {
        const mailRaw = localStorage.getItem("geza_mail_thread_" + _case.id);
        const mailThread = mailRaw ? JSON.parse(mailRaw) : [];
        if (mailThread.length > 0) {
          mailSummary = mailThread.map(function (m) {
            const dir = m.type === "received" ? "【受信】" : "【送信】";
            const content = (m.content || "").slice(0, 100);
            return dir + " " + content + (m.content && m.content.length > 100 ? "..." : "");
          }).join("\n");
        }
      } catch (e) { /* ignore */ }

      const resp = await ApiClient.post("/plan/consult", {
        incident_summary:     _case ? (_case.enrichedSummary || _case.incidentSummary || "") : "",
        opponent_type:        op.type        || "不明",
        opponent_anger_level: op.anger_level || 50,
        current_plan_summary: plan.first_words || "",
        current_todo_list:    todoSummary,
        mail_thread_summary:  mailSummary,
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

    // フォローメール・再発防止策ページへ遷移
    const btnFollowMail = document.getElementById("btn-follow-mail");
    if (btnFollowMail) {
      btnFollowMail.addEventListener("click", function () {
        if (!_case) return;
        // feedback-detail.js が必要とする practiceResult を最小構成でセット
        const minimalResult = {
          opponentProfile:    _case.opponentProfile || {},
          conversationHistory: [],
          problems:           [],
          improvedApologyText: "",
          finalTrustScore:    30,
          finalAngryScore:    50,
          turnCount:          0,
          ngWordCount:        0,
          sessionResult:      "give_up",
        };
        StateManager.setPersistent("practiceResult", minimalResult);
        // 戻り先を case-detail として記録
        StateManager.setPersistent("feedbackDetailSource", "case-detail");
        if (_animator) _animator.stop();
        window.location.assign("feedback-detail.html");
      });
    }

    // メール対応ページへ遷移
    const btnMailThread = document.getElementById("btn-mail-thread");
    if (btnMailThread) {
      btnMailThread.addEventListener("click", function () {
        if (_animator) _animator.stop();
        window.location.assign("mail-thread.html");
      });
    }

    // メールスレッドバッジ表示
    _updateMailThreadBadge();

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try { await AuthModule.logout(); } catch { /* ignore */ }
        window.location.assign("../index.html");
      });
    }
  }

  // ── メールスレッドバッジ ──
  function _updateMailThreadBadge() {
    const badge = document.getElementById("mail-thread-badge");
    if (!badge || !_case) return;
    try {
      const raw = localStorage.getItem("geza_mail_thread_" + _case.id);
      const thread = raw ? JSON.parse(raw) : [];
      if (thread.length > 0) {
        badge.textContent = "📬 " + thread.length + "通のやり取りがあります";
        badge.style.display = "block";
      }
    } catch (e) { /* ignore */ }
  }

  // ── 謝罪完了モーダル ─────────────────────────────────────────────────────
  let _selectedOutcome = null;

  function _setupCompleteModal() {
    const btnComplete  = document.getElementById("btn-complete");
    const modal        = document.getElementById("complete-modal");
    const btnCancel    = document.getElementById("btn-complete-cancel");
    const btnSubmit    = document.getElementById("btn-complete-submit");
    const errEl        = document.getElementById("complete-modal-error");
    const outcomeButtons = document.querySelectorAll(".outcome-btn");

    if (!btnComplete || !modal) return;

    // 既に完了済みかどうかを localStorage から確認（案件IDベース）
    const completedKey = "geza_completed_" + (_case ? _case.id : "");
    const isCompleted  = localStorage.getItem(completedKey) === "1";

    const badgeWrap = document.getElementById("complete-badge-wrap");
    if (isCompleted) {
      if (badgeWrap) badgeWrap.style.display = "block";
    } else {
      btnComplete.style.display = "block";
    }

    btnComplete.addEventListener("click", function () {
      _selectedOutcome = null;
      outcomeButtons.forEach((b) => b.classList.remove("selected"));
      if (btnSubmit) btnSubmit.disabled = true;
      if (errEl) errEl.style.display = "none";
      const notes = document.getElementById("complete-notes");
      if (notes) notes.value = "";
      modal.classList.add("visible");
    });

    outcomeButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        _selectedOutcome = btn.dataset.outcome;
        outcomeButtons.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        if (btnSubmit) btnSubmit.disabled = false;
      });
    });

    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        modal.classList.remove("visible");
      });
    }

    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) modal.classList.remove("visible");
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener("click", async function () {
        if (!_selectedOutcome) return;
        const notes = (document.getElementById("complete-notes") || {}).value || "";

        btnSubmit.disabled = true;
        if (errEl) errEl.style.display = "none";

        try {
          const sessionId = _case ? _case.id : null;
          if (sessionId) {
            const actualResult = JSON.stringify({
              outcome:      _selectedOutcome,
              notes:        notes.slice(0, 500),
              completed_at: new Date().toISOString(),
            });
            await ApiClient.post("/sessions", {
              session_id:    sessionId,
              actual_result: actualResult,
              apology_status: "completed",
            });
          }

          // ローカルに完了フラグを保存
          if (_case) localStorage.setItem("geza_completed_" + _case.id, "1");

          // analyze-karte キャッシュを破棄（傾向分析を最新化）
          StateManager.removePersistent("karteAnalysis");

          modal.classList.remove("visible");

          // UI 更新
          if (btnComplete) btnComplete.style.display = "none";
          if (badgeWrap)   badgeWrap.style.display = "block";

        } catch (err) {
          if (errEl) {
            errEl.textContent = "記録に失敗しました: " + err.message;  // XSS-01
            errEl.style.display = "block";
          }
          btnSubmit.disabled = false;
          console.error("save-session complete error:", err);
        }
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
      // キャッシュにない場合は API から全件取得してキャッシュを更新する
      try {
        await AuthModule.silentRefresh().catch(function () {});
        const data = await ApiClient.get("/sessions");
        const sessions = (data && Array.isArray(data.sessions)) ? data.sessions : [];
        try {
          localStorage.setItem("geza_cases", JSON.stringify(sessions));
        } catch (e) { /* ignore */ }
        _case = sessions.find(function (c) { return c.id === caseId; }) || null;
      } catch (fetchErr) {
        console.error("case fetch error:", fetchErr);
      }
    }

    if (!_case) {
      window.location.assign("dashboard.html");
      return;
    }

    _setupNavigation();
    _setupDeleteModal();
    _setupCompleteModal();
    _setupTimeline();
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

