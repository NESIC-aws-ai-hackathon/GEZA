/**
 * dashboard.js — GEZA 実案件一覧コントローラー
 *
 * 案件データは localStorage の "geza_cases" に保存
 * [ { id, createdAt, updatedAt, incidentSummary, opponentProfile, apologyPlan, faceConfig, assessmentResult } ]
 *
 * XSS-01 準拠: ユーザーデータは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  const STORAGE_KEY = "geza_cases";

  // ── データ操作 ──────────────────────────────────────────────────────────
  function _loadCases() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function _saveCases(cases) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    } catch (err) {
      console.warn("Failed to save cases", err);
    }
  }

  function _deleteCase(id) {
    const cases = _loadCases().filter((c) => c.id !== id);
    _saveCases(cases);
  }

  // ── 日付フォーマット ──────────────────────────────────────────────────────
  function _fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}/${day}`;
  }

  // ── サマリーテキスト生成 ─────────────────────────────────────────────────
  function _getSummaryText(c) {
    if (c.enrichedSummary) return c.enrichedSummary;
    if (c.incidentSummary) return c.incidentSummary;
    if (c.apologyPlan && c.apologyPlan.first_words) return c.apologyPlan.first_words;
    return "（概要なし）";
  }

  function _getCaseTitle(c) {
    if (c.incidentSummary && c.incidentSummary.length > 0) {
      return c.incidentSummary.slice(0, 30) + (c.incidentSummary.length > 30 ? "…" : "");
    }
    if (c.opponentProfile && c.opponentProfile.type) {
      return c.opponentProfile.type + " への謝罪";
    }
    return "謝罪案件";
  }

  // ── カード描画 ────────────────────────────────────────────────────────────
  function _renderCases() {
    const list = document.getElementById("cases-list");
    if (!list) return;
    list.textContent = "";

    const cases = _loadCases();

    if (cases.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.setAttribute("aria-label", "案件なし");

      const icon = document.createElement("div");
      icon.className = "empty-state-icon";
      icon.textContent = "📭";
      const title = document.createElement("div");
      title.className = "empty-state-title";
      title.textContent = "案件がまだありません";
      const desc = document.createElement("div");
      desc.className = "empty-state-desc";
      desc.textContent = "「＋ 新しい案件」から謝罪プランを作成すると、ここに表示されます。";

      empty.appendChild(icon);
      empty.appendChild(title);
      empty.appendChild(desc);
      list.appendChild(empty);
      return;
    }

    cases.forEach((c) => {
      const card = _buildCard(c);
      list.appendChild(card);
    });
  }

  function _buildCard(c) {
    const card = document.createElement("div");
    card.className = "case-card";
    card.setAttribute("role", "listitem");

    // ヘッダー行（タイトル + 日付）
    const header = document.createElement("div");
    header.className = "case-card-header";

    const title = document.createElement("div");
    title.className = "case-card-title";
    title.textContent = _getCaseTitle(c);  // XSS-01

    const date = document.createElement("div");
    date.className = "case-card-date";
    date.textContent = _fmtDate(c.createdAt);

    header.appendChild(title);
    header.appendChild(date);

    // メタバッジ（相手・怒りレベル）
    const meta = document.createElement("div");
    meta.className = "case-card-meta";

    if (c.opponentProfile) {
      const op = c.opponentProfile;
      if (op.type) {
        const b = document.createElement("span");
        b.className = "case-meta-badge";
        b.textContent = op.type;
        meta.appendChild(b);
      }
      if (op.anger_level != null) {
        const b = document.createElement("span");
        b.className = "case-meta-badge anger";
        b.textContent = "怒り " + op.anger_level + "%";
        meta.appendChild(b);
      }
    }
    if (c.assessmentResult && c.assessmentResult.ai_degree != null) {
      const b = document.createElement("span");
      b.className = "case-meta-badge";
      b.textContent = "AI判定 " + c.assessmentResult.ai_degree + "%";
      meta.appendChild(b);
    }

    // 概要
    const summary = document.createElement("div");
    summary.className = "case-card-summary";
    summary.textContent = _getSummaryText(c);  // XSS-01

    // フッターボタン行
    const footer = document.createElement("div");
    footer.className = "case-card-footer";

    const btnDetail = document.createElement("button");
    btnDetail.className = "btn-case-action";
    btnDetail.type = "button";
    btnDetail.textContent = "📂 詳細";
    btnDetail.addEventListener("click", function (e) {
      e.stopPropagation();
      sessionStorage.setItem("geza_current_case_id", c.id);
      window.location.assign("case-detail.html");
    });

    const btnRehearsal = document.createElement("button");
    btnRehearsal.className = "btn-case-action rehearsal";
    btnRehearsal.type = "button";
    btnRehearsal.textContent = "🎙️ リハーサル";
    btnRehearsal.addEventListener("click", function (e) {
      e.stopPropagation();
      _launchRehearsal(c);
    });

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn-case-action delete";
    btnDelete.type = "button";
    btnDelete.textContent = "🗑️ 削除";
    btnDelete.setAttribute("aria-label", "案件を削除");
    btnDelete.addEventListener("click", function (e) {
      e.stopPropagation();
      _confirmDelete(c.id, _getCaseTitle(c));
    });

    footer.appendChild(btnDetail);
    footer.appendChild(btnRehearsal);
    footer.appendChild(btnDelete);

    // カード全体クリックで詳細へ
    card.addEventListener("click", function () {
      sessionStorage.setItem("geza_current_case_id", c.id);
      window.location.assign("case-detail.html");
    });

    card.appendChild(header);
    if (meta.children.length > 0) card.appendChild(meta);
    card.appendChild(summary);
    card.appendChild(footer);

    return card;
  }

  // ── リハーサル起動 ──────────────────────────────────────────────────────
  function _launchRehearsal(c) {
    if (!c.opponentProfile) {
      alert("案件データが不完全です。詳細ページからご確認ください。");
      return;
    }
    // practice.js が読む形式に合わせて sessionStorage に書く
    const profile = Object.assign({}, c.opponentProfile, {
      faceConfig: c.faceConfig || null,
    });
    StateManager.setPersistent("opponentProfile", profile);
    StateManager.setPersistent("apologyPlan", c.apologyPlan || null);
    window.location.assign("practice.html");
  }

  // ── 削除確認 ─────────────────────────────────────────────────────────────
  let _pendingDeleteId = null;

  function _confirmDelete(id, title) {
    _pendingDeleteId = id;
    const modal = document.getElementById("delete-modal");
    const desc  = document.getElementById("modal-desc-text");
    if (desc) {
      // XSS-01: textContent 使用
      desc.textContent = `「${title}」を削除します。この操作は取り消せません。`;
    }
    if (modal) modal.classList.add("visible");
  }

  function _setupDeleteModal() {
    const modal    = document.getElementById("delete-modal");
    const btnCancel = document.getElementById("btn-modal-cancel");
    const btnDelete = document.getElementById("btn-modal-delete");

    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        _pendingDeleteId = null;
        modal.classList.remove("visible");
      });
    }
    if (btnDelete) {
      btnDelete.addEventListener("click", function () {
        if (_pendingDeleteId) {
          _deleteCase(_pendingDeleteId);
          _pendingDeleteId = null;
        }
        modal.classList.remove("visible");
        _renderCases();
      });
    }
    // 背景クリックでキャンセル
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) {
          _pendingDeleteId = null;
          modal.classList.remove("visible");
        }
      });
    }
  }

  // ── ナビゲーション ────────────────────────────────────────────────────────
  function _setupNavigation() {
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        window.location.assign("../index.html");
      });
    }

    const btnNewCase = document.getElementById("btn-new-case");
    if (btnNewCase) {
      btnNewCase.addEventListener("click", function () {
        window.location.assign("inception.html");
      });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try { await AuthModule.logout(); } catch { /* ignore */ }
        window.location.assign("../index.html");
      });
    }
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────
  async function init() {
    if (!AuthModule.requireAuth()) return;
    _setupNavigation();
    _setupDeleteModal();
    _renderCases();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
