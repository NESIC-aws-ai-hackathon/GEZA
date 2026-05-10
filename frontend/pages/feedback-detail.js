/**
 * feedback-detail.js — GEZA 再発防止・フォローメールページ（U4）
 *
 * 依存: config.js / auth.js / state.js / api.js
 * XSS-01: AI 生成テキストは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  const CHECKLIST_PREFIX = "geza_checklist_";

  let _caseId        = null;
  let _feedbackData  = null;
  let _preventionGenerated = false;

  // ── 初期化 ────────────────────────────────────────────────────────────────
  async function init() {
    if (!AuthModule.requireAuth()) return;

    _caseId       = StateManager.getPersistent("geza_current_case_id") || "unknown";
    _feedbackData = StateManager.getPersistent("practiceResult");

    if (!_feedbackData) {
      window.location.href = "feedback.html";
      return;
    }

    // 戻り先の決定
    const source = StateManager.getPersistent("feedbackDetailSource");
    const backTarget = source === "case-detail" ? "case-detail.html" : "feedback.html";

    // ボタン・タブバインド
    _setupTabs();
    _setupButtons();

    // チェックリスト状態復元
    _restoreChecklistState();

    // ヘッダー
    document.getElementById("back-btn").addEventListener("click", () => {
      window.location.href = backTarget;
    });
    document.getElementById("logout-btn").addEventListener("click", () => {
      AuthModule.signOut();
    });
  }

  // ── タブ制御 ──────────────────────────────────────────────────────────────
  function _setupTabs() {
    const tabs   = document.querySelectorAll(".fd-tab");
    const panels = document.querySelectorAll(".fd-tab-panel");

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
        panels.forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        const panelId = tab.getAttribute("aria-controls");
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add("active");
      });
    });
  }

  // ── ボタンバインド ────────────────────────────────────────────────────────
  function _setupButtons() {
    const btnPrev = document.getElementById("btn-generate-prevention");
    if (btnPrev) btnPrev.addEventListener("click", _generatePrevention);

    const btnMail = document.getElementById("btn-generate-mail");
    if (btnMail) btnMail.addEventListener("click", _generateFollowMail);

    const btnCopy = document.getElementById("btn-copy-mail");
    if (btnCopy) btnCopy.addEventListener("click", _copyMailToClipboard);

    // チェックリスト固定項目のチェック状態変更
    for (var i = 0; i < 5; i++) {
      (function (idx) {
        const cb = document.getElementById("cl-fix-" + idx + "-cb");
        if (cb) {
          cb.addEventListener("change", function () {
            _saveCheckState("fix_" + idx, cb.checked);
            const item = document.getElementById("cl-fix-" + idx);
            if (item) item.classList.toggle("done", cb.checked);
          });
        }
      })(i);
    }
  }

  // ── チェックリスト状態管理 ───────────────────────────────────────────────
  function _getChecklistKey() {
    return CHECKLIST_PREFIX + _caseId;
  }

  function _saveCheckState(id, done) {
    try {
      const state = JSON.parse(localStorage.getItem(_getChecklistKey()) || "{}");
      state[id] = done;
      localStorage.setItem(_getChecklistKey(), JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function _loadCheckState() {
    try {
      return JSON.parse(localStorage.getItem(_getChecklistKey()) || "{}");
    } catch (e) { return {}; }
  }

  function _restoreChecklistState() {
    const state = _loadCheckState();
    for (var i = 0; i < 5; i++) {
      const cb   = document.getElementById("cl-fix-" + i + "-cb");
      const item = document.getElementById("cl-fix-" + i);
      if (cb && state["fix_" + i]) {
        cb.checked = true;
        if (item) item.classList.add("done");
      }
    }
  }

  // ── generate-prevention API 呼び出し ────────────────────────────────────
  async function _generatePrevention() {
    if (_preventionGenerated) return;

    const btn     = document.getElementById("btn-generate-prevention");
    const spinner = document.getElementById("spinner-prevention");
    const label   = document.getElementById("label-prevention");
    const errDiv  = document.getElementById("prevention-error");

    btn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (label)   label.textContent = "AIが分析中...";
    if (errDiv)  errDiv.style.display = "none";

    try {
      const payload = {
        conversation_history: _feedbackData.conversationHistory ?? [],
        opponent_profile:     _feedbackData.opponentProfile ?? {},
        problems:             _feedbackData.problems ?? [],
        final_trust_score:    _feedbackData.finalTrustScore ?? 30,
      };

      const result = await ApiClient.post("/prevention/generate", payload);

      // AI追加チェックリスト項目を描画
      _renderAiChecklist(result.checklist_ai ?? []);

      // 再発防止ステップを描画
      _renderPreventionSteps(result.prevention_steps ?? [], result.summary ?? "");

      _preventionGenerated = true;

      // ボタンを非表示に（生成済み）
      btn.style.display = "none";

    } catch (err) {
      btn.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (label)   label.textContent = "再試行する";
      if (errDiv) {
        errDiv.style.display = "block";
        errDiv.innerHTML = "";
        const card = document.createElement("div");
        card.className = "error-card";
        card.textContent = "生成に失敗しました: " + err.message;  // XSS-01
        errDiv.appendChild(card);
      }
      console.error("generate-prevention error:", err);
    }
  }

  function _renderAiChecklist(items) {
    const container = document.getElementById("checklist-ai");
    if (!container) return;
    container.textContent = "";

    items.forEach(function (text, i) {
      const id = "cl-ai-" + i;
      const div = document.createElement("div");
      div.className = "checklist-item";
      div.id = id;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id + "-cb";
      cb.setAttribute("aria-label", text);
      cb.addEventListener("change", function () {
        _saveCheckState("ai_" + i, cb.checked);
        div.classList.toggle("done", cb.checked);
      });
      // 保存済み状態を復元
      const state = _loadCheckState();
      if (state["ai_" + i]) {
        cb.checked = true;
        div.classList.add("done");
      }

      const lbl = document.createElement("label");
      lbl.setAttribute("for", id + "-cb");
      lbl.textContent = text;  // XSS-01

      div.appendChild(cb);
      div.appendChild(lbl);
      container.appendChild(div);
    });
  }

  function _renderPreventionSteps(steps, summary) {
    const stepsEl   = document.getElementById("prevention-steps-list");
    const summaryEl = document.getElementById("prevention-summary");
    const notGen    = document.getElementById("prevention-not-generated");
    const content   = document.getElementById("prevention-steps-content");

    if (notGen)  notGen.style.display = "none";
    if (content) content.style.display = "block";

    if (stepsEl) {
      stepsEl.textContent = "";
      steps.forEach(function (s) {
        const div = document.createElement("div");
        div.className = "prevention-step";

        const num = document.createElement("div");
        num.className = "step-num";
        num.textContent = s.step;  // XSS-01

        const detail = document.createElement("div");
        detail.className = "step-detail";
        detail.textContent = s.detail;  // XSS-01

        div.appendChild(num);
        div.appendChild(detail);
        stepsEl.appendChild(div);
      });
    }

    if (summaryEl) summaryEl.textContent = summary;  // XSS-01
  }

  // ── generate-follow-mail API 呼び出し ────────────────────────────────────
  async function _generateFollowMail() {
    const btn     = document.getElementById("btn-generate-mail");
    const spinner = document.getElementById("spinner-mail");
    const label   = document.getElementById("label-mail");
    const errDiv  = document.getElementById("mail-error");
    const content = document.getElementById("mail-content");

    btn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (label)   label.textContent = "AIが生成中...";
    if (errDiv)  errDiv.style.display = "none";

    try {
      const payload = {
        opponent_profile:      _feedbackData.opponentProfile ?? {},
        problems:              _feedbackData.problems ?? [],
        improved_apology_text: _feedbackData.improvedApologyText ?? "",
        final_trust_score:     _feedbackData.finalTrustScore ?? 30,
      };

      const result = await ApiClient.post("/mail/generate", payload);

      // 件名・本文を表示
      const subjectEl = document.getElementById("mail-subject");
      const bodyEl    = document.getElementById("mail-body");
      if (subjectEl) subjectEl.textContent = result.subject ?? "";  // XSS-01
      if (bodyEl)    bodyEl.textContent    = result.body    ?? "";  // XSS-01

      if (content) content.style.display = "block";

      // フォローメールをメールスレッドに保存
      _saveFollowMailToThread(result.subject ?? "", result.body ?? "");

      // ボタンを非表示に（生成済み）
      btn.style.display = "none";

    } catch (err) {
      btn.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (label)   label.textContent = "再試行する";
      if (errDiv) {
        errDiv.style.display = "block";
        errDiv.innerHTML = "";
        const card = document.createElement("div");
        card.className = "error-card";
        card.textContent = "生成に失敗しました: " + err.message;  // XSS-01
        errDiv.appendChild(card);
      }
      console.error("generate-follow-mail error:", err);
    }
  }

  // ── フォローメールをメールスレッドに保存 ──────────────────────────────────
  function _saveFollowMailToThread(subject, body) {
    if (!body) return;
    try {
      var threadKey = "geza_mail_thread_" + _caseId;
      var raw = localStorage.getItem(threadKey);
      var thread = raw ? JSON.parse(raw) : [];
      thread.push({
        type:      "sent",
        subject:   subject,
        content:   body,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem(threadKey, JSON.stringify(thread));
      // DynamoDB にも保存（サイレント）
      ApiClient.post("/sessions", {
        session_id:  _caseId,
        mail_thread: JSON.stringify(thread),
      }).catch(function (e) {
        console.warn("mail_thread save failed:", e);
      });
    } catch (e) { /* ignore */ }
  }

  // ── クリップボードコピー ──────────────────────────────────────────────────
  async function _copyMailToClipboard() {
    const subject = document.getElementById("mail-subject");
    const body    = document.getElementById("mail-body");
    if (!subject || !body) return;

    const text = "件名: " + subject.textContent + "\n\n" + body.textContent;
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById("btn-copy-mail");
      if (btn) {
        btn.textContent = "✅ コピーしました";
        setTimeout(function () { btn.textContent = "📋 クリップボードにコピー"; }, 2000);
      }
    } catch (e) {
      console.error("clipboard copy failed:", e);
    }
  }

  // ── フォローメールをメールスレッドに保存 ──────────────────────────────────
  function _saveFollowMailToThread(subject, body) {
    if (!body || !_caseId) return;
    try {
      var key = "geza_mail_thread_" + _caseId;
      var raw = localStorage.getItem(key);
      var thread = raw ? JSON.parse(raw) : [];
      thread.push({
        type:      "sent",
        subject:   subject,
        content:   body,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(thread));
      // サーバーにも保存
      ApiClient.post("/sessions", {
        session_id:  _caseId,
        mail_thread: JSON.stringify(thread),
      }).catch(function (e) {
        console.warn("mail_thread save failed:", e);
      });
    } catch (e) { /* ignore */ }
  }

  // ── エントリポイント ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
