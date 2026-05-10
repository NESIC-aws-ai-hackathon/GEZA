/**
 * mail-thread.js — GEZA メール対応アシスタント
 *
 * 依存: config.js / auth.js / state.js / api.js
 * XSS-01: ユーザーデータは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  var _caseId       = null;
  var _case         = null;
  var _mailThread   = [];    // [{type, subject, content, timestamp}]
  var _isGenerating = false;

  // ── 初期化 ────────────────────────────────────────────────────────────────
  async function init() {
    if (!AuthModule.requireAuth()) return;

    _caseId = sessionStorage.getItem("geza_current_case_id");
    if (!_caseId) {
      window.location.assign("dashboard.html");
      return;
    }

    // ローカルストレージから案件データ取得
    _case = _loadCase(_caseId);
    if (!_case) {
      window.location.assign("dashboard.html");
      return;
    }

    // 案件サマリー表示
    var label = document.getElementById("case-summary-label");
    if (label) {
      label.textContent = _case.incidentSummary || _case.enrichedSummary || "";
    }

    // メールスレッド読み込み（ローカル → API）
    _loadMailThread();

    // ボタンバインド
    _setupButtons();
    _setupNavigation();

    // スレッド描画
    _renderThread();
  }

  // ── 案件データ読み込み ────────────────────────────────────────────────────
  function _loadCase(id) {
    try {
      var raw = localStorage.getItem("geza_cases");
      var cases = raw ? JSON.parse(raw) : [];
      return cases.find(function (c) { return c.id === id; }) || null;
    } catch (e) { return null; }
  }

  // ── メールスレッド管理 ─────────────────────────────────────────────────────
  function _getThreadKey() {
    return "geza_mail_thread_" + _caseId;
  }

  function _loadMailThread() {
    try {
      var raw = localStorage.getItem(_getThreadKey());
      _mailThread = raw ? JSON.parse(raw) : [];
    } catch (e) {
      _mailThread = [];
    }
    // API から取得済みのスレッドがあれば統合
    if (_case && _case.mailThread && Array.isArray(_case.mailThread) && _case.mailThread.length > 0) {
      if (_mailThread.length === 0) {
        _mailThread = _case.mailThread;
        _saveMailThreadLocal();
      }
    }
  }

  function _saveMailThreadLocal() {
    try {
      localStorage.setItem(_getThreadKey(), JSON.stringify(_mailThread));
    } catch (e) { /* ignore */ }
  }

  function _saveMailThreadToServer() {
    // DynamoDB に保存（サイレント）
    ApiClient.post("/sessions", {
      session_id:  _caseId,
      mail_thread: JSON.stringify(_mailThread),
    }).catch(function (e) {
      console.warn("mail_thread save failed:", e);
    });
  }

  function _addToThread(type, subject, content) {
    _mailThread.push({
      type:      type,
      subject:   subject || "",
      content:   content,
      timestamp: new Date().toISOString(),
    });
    _saveMailThreadLocal();
    _saveMailThreadToServer();
    _renderThread();
  }

  // ── スレッド描画 ──────────────────────────────────────────────────────────
  function _renderThread() {
    var container = document.getElementById("thread-list");
    var empty     = document.getElementById("thread-empty");
    var stats     = document.getElementById("thread-stats");

    if (_mailThread.length === 0) {
      if (empty) empty.style.display = "block";
      if (stats) stats.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (stats) stats.style.display = "flex";

    // 統計更新
    var received = _mailThread.filter(function (m) { return m.type === "received"; }).length;
    var sent     = _mailThread.filter(function (m) { return m.type === "sent"; }).length;
    _setText("stat-total", String(_mailThread.length));
    _setText("stat-received", String(received));
    _setText("stat-sent", String(sent));

    // カード描画
    container.textContent = "";
    _mailThread.forEach(function (mail, idx) {
      container.appendChild(_createMailCard(mail, idx));
    });
  }

  function _createMailCard(mail, idx) {
    var card = document.createElement("div");
    card.className = "mail-card " + mail.type;

    // ヘッダー
    var header = document.createElement("div");
    header.className = "mail-card-header";

    var label = document.createElement("span");
    label.className = "mail-card-label";
    label.textContent = mail.type === "received" ? "📨 受信" : "📤 送信";

    var time = document.createElement("span");
    time.className = "mail-card-time";
    time.textContent = _formatTime(mail.timestamp);

    header.appendChild(label);
    header.appendChild(time);
    card.appendChild(header);

    // 件名
    if (mail.subject) {
      var subjectEl = document.createElement("div");
      subjectEl.className = "mail-card-subject";
      subjectEl.textContent = mail.subject;
      card.appendChild(subjectEl);
    }

    // 本文
    var body = document.createElement("div");
    body.className = "mail-card-body";
    body.textContent = mail.content;
    card.appendChild(body);

    // アクション
    var actions = document.createElement("div");
    actions.className = "mail-card-actions";

    var copyBtn = document.createElement("button");
    copyBtn.className = "mail-card-btn";
    copyBtn.textContent = "📋 コピー";
    copyBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var text = (mail.subject ? "件名: " + mail.subject + "\n\n" : "") + mail.content;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = "✅ コピー済み";
        setTimeout(function () { copyBtn.textContent = "📋 コピー"; }, 2000);
      }).catch(function () { /* ignore */ });
    });
    actions.appendChild(copyBtn);

    var delBtn = document.createElement("button");
    delBtn.className = "mail-card-btn";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (confirm("このメールをスレッドから削除しますか？")) {
        _mailThread.splice(idx, 1);
        _saveMailThreadLocal();
        _saveMailThreadToServer();
        _renderThread();
      }
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    return card;
  }

  // ── AI返信生成 ────────────────────────────────────────────────────────────
  async function _generateReply() {
    if (_isGenerating) return;

    var input = document.getElementById("received-mail-input");
    var text  = (input ? input.value : "").trim();
    if (!text) {
      alert("メール本文を入力してください。");
      return;
    }

    _isGenerating = true;
    var btn     = document.getElementById("btn-generate-reply");
    var spinner = document.getElementById("spinner-reply");
    var label   = document.getElementById("label-reply");
    var errDiv  = document.getElementById("generate-error");

    btn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (label)   label.textContent = "AIが返信を考えています...";
    if (errDiv)  errDiv.style.display = "none";

    try {
      var op = (_case && _case.opponentProfile) || {};
      var result = await ApiClient.post("/mail/reply", {
        received_mail:    text,
        incident_summary: _case ? (_case.enrichedSummary || _case.incidentSummary || "") : "",
        opponent_profile: op,
        mail_thread:      _mailThread,
        apology_status:   _case ? (_case.apologyStatus || "planned") : "planned",
      });

      // 受信メールをスレッドに追加
      _addToThread("received", "", text);

      // AI返信をプレビューに表示
      var preview = document.getElementById("reply-preview");
      if (preview) preview.classList.add("visible");

      var subjectInput = document.getElementById("reply-subject");
      var bodyInput    = document.getElementById("reply-body");
      var adviceEl     = document.getElementById("tone-advice");

      if (subjectInput) subjectInput.value = result.subject || "";
      if (bodyInput)    bodyInput.value    = result.body    || "";
      if (adviceEl && result.tone_advice) {
        adviceEl.textContent = "💡 " + result.tone_advice;
        adviceEl.style.display = "block";
      }

      // 入力欄をクリア
      if (input) input.value = "";

    } catch (err) {
      if (errDiv) {
        errDiv.style.display = "block";
        errDiv.textContent = "";
        var card = document.createElement("div");
        card.className = "error-card";
        card.textContent = "返信の生成に失敗しました: " + err.message;
        errDiv.appendChild(card);
      }
      console.error("generate-mail-reply error:", err);
    } finally {
      _isGenerating = false;
      btn.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (label)   label.textContent = "🤖 AI返信を自動生成";
    }
  }

  // ── 受信メールだけ保存 ────────────────────────────────────────────────────
  function _saveReceivedOnly() {
    var input = document.getElementById("received-mail-input");
    var text  = (input ? input.value : "").trim();
    if (!text) {
      alert("メール本文を入力してください。");
      return;
    }
    _addToThread("received", "", text);
    if (input) input.value = "";
  }

  // ── 返信を保存 ───────────────────────────────────────────────────────────
  function _saveReply() {
    var subject = (document.getElementById("reply-subject") || {}).value || "";
    var body    = (document.getElementById("reply-body")    || {}).value || "";

    if (!body.trim()) {
      alert("返信本文を入力してください。");
      return;
    }

    _addToThread("sent", subject, body.trim());

    // プレビューを閉じる
    var preview = document.getElementById("reply-preview");
    if (preview) preview.classList.remove("visible");

    // ローカルの案件データにもスレッドを反映
    _updateLocalCase();
  }

  // ── 返信をコピー ─────────────────────────────────────────────────────────
  function _copyReply() {
    var subject = (document.getElementById("reply-subject") || {}).value || "";
    var body    = (document.getElementById("reply-body")    || {}).value || "";
    var text    = (subject ? "件名: " + subject + "\n\n" : "") + body;

    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById("btn-copy-reply");
      if (btn) {
        btn.textContent = "✅ コピー済み";
        setTimeout(function () { btn.textContent = "📋 コピー"; }, 2000);
      }
    }).catch(function (e) {
      console.error("clipboard copy failed:", e);
    });
  }

  // ── ローカル案件データ更新 ────────────────────────────────────────────────
  function _updateLocalCase() {
    try {
      var raw = localStorage.getItem("geza_cases");
      var cases = raw ? JSON.parse(raw) : [];
      var idx = cases.findIndex(function (c) { return c.id === _caseId; });
      if (idx >= 0) {
        cases[idx].mailThread = _mailThread;
        cases[idx].updatedAt  = new Date().toISOString();
        localStorage.setItem("geza_cases", JSON.stringify(cases));
      }
    } catch (e) { /* ignore */ }
  }

  // ── ボタンバインド ────────────────────────────────────────────────────────
  function _setupButtons() {
    var btnGen      = document.getElementById("btn-generate-reply");
    var btnSaveRecv = document.getElementById("btn-save-received");
    var btnSave     = document.getElementById("btn-save-reply");
    var btnCopy     = document.getElementById("btn-copy-reply");

    if (btnGen)      btnGen.addEventListener("click", _generateReply);
    if (btnSaveRecv) btnSaveRecv.addEventListener("click", _saveReceivedOnly);
    if (btnSave)     btnSave.addEventListener("click", _saveReply);
    if (btnCopy)     btnCopy.addEventListener("click", _copyReply);
  }

  // ── ナビゲーション ────────────────────────────────────────────────────────
  function _setupNavigation() {
    var backBtn = document.getElementById("back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        window.location.assign("case-detail.html");
      });
    }
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        AuthModule.signOut();
      });
    }
  }

  // ── ユーティリティ ────────────────────────────────────────────────────────
  function _setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function _formatTime(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("ja-JP", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      });
    } catch (e) { return iso; }
  }

  // ── エントリポイント ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
