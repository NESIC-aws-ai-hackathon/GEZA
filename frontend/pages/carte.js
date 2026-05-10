/**
 * carte.js — GEZA 謝罪カルテページ（U4）
 *
 * 依存: config.js / auth.js / state.js / api.js
 * XSS-01: ユーザーデータは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  const ANALYSIS_CACHE_KEY = "karteAnalysis";

  // ── 削除済みID取得 ────────────────────────────────────────────────────────
  function _getDeletedIds() {
    try {
      return JSON.parse(localStorage.getItem("geza_deleted_cases") || "[]");
    } catch (e) { return []; }
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────
  async function init() {
    if (!AuthModule.requireAuth()) return;

    document.getElementById("back-btn").addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });
    document.getElementById("logout-btn").addEventListener("click", () => {
      AuthModule.signOut();
    });

    // カルテ一覧と傾向分析を並行取得
    await Promise.all([_loadKarte(), _analyzeKarte()]);
  }

  // ── カルテ一覧取得 ────────────────────────────────────────────────────────
  async function _loadKarte() {
    const container = document.getElementById("karte-list-container");
    try {
      const result   = await ApiClient.get("/karte");
      const sessions = result.sessions ?? [];

      // ローカル削除済みリストでフィルタ
      const deletedIds = _getDeletedIds();
      const filtered = sessions.filter(function (s) {
        return !deletedIds.includes(s.session_id);
      });

      container.textContent = "";

      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const icon = document.createElement("div");
        icon.className = "empty-state-icon";
        icon.textContent = "📂";

        const text = document.createElement("div");
        text.className = "empty-state-text";
        text.textContent = "まだ謝罪案件がありません。\nインセプションページから案件を作成してください。";  // XSS-01

        empty.appendChild(icon);
        empty.appendChild(text);
        container.appendChild(empty);
        return;
      }

      const list = document.createElement("div");
      list.className = "karte-list";
      filtered.forEach(function (s) {
        list.appendChild(_createKarteCard(s));
      });
      container.appendChild(list);

    } catch (err) {
      container.textContent = "";
      const card = document.createElement("div");
      card.className = "error-card";
      card.style.cssText = "padding:14px;background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.3);border-radius:10px;font-size:13px;color:#e94560;";
      card.textContent = "カルテの読み込みに失敗しました: " + err.message;  // XSS-01
      container.appendChild(card);
      console.error("get-karte error:", err);
    }
  }

  // ── カルテカード生成 ──────────────────────────────────────────────────────
  function _createKarteCard(s) {
    const card = document.createElement("div");
    card.className = "karte-card";

    // ヘッダー行
    const header = document.createElement("div");
    header.className = "karte-card-header";

    // 謝罪角度バッジ
    const deg = s.ai_degree || 0;
    const badge = document.createElement("div");
    badge.className = "karte-degree-badge " + _degreeColorClass(deg);
    badge.setAttribute("aria-label", "謝罪角度 " + deg + "度");
    badge.textContent = deg + "°";  // XSS-01

    // メタ
    const meta = document.createElement("div");
    meta.className = "karte-meta";

    const summary = document.createElement("div");
    summary.className = "karte-summary";
    const summaryText = s.incident_summary || "案件";
    summary.textContent = summaryText.slice(0, 35) + (summaryText.length > 35 ? "…" : "");  // XSS-01

    const dateEl = document.createElement("div");
    dateEl.className = "karte-date";
    dateEl.textContent = _formatDate(s.updated_at || s.created_at);  // XSS-01

    meta.appendChild(summary);
    meta.appendChild(dateEl);
    header.appendChild(badge);
    header.appendChild(meta);
    card.appendChild(header);

    // ステータス行：ローカルの完了フラグを優先
    const statusRow = document.createElement("div");
    statusRow.className = "karte-status-row";

    const effectiveStatus = localStorage.getItem("geza_completed_" + s.session_id) === "1"
      ? "completed"
      : (s.apology_status || "planned");

    const statusChip = document.createElement("span");
    statusChip.className = "status-chip " + effectiveStatus;
    statusChip.textContent = _statusLabel(effectiveStatus);  // XSS-01
    statusRow.appendChild(statusChip);

    if (s.practice_result && s.practice_result.final_trust != null) {
      const trustEl = document.createElement("span");
      trustEl.className = "karte-trust";
      trustEl.textContent = "練習時信頼度: " + s.practice_result.final_trust + "%";  // XSS-01
      statusRow.appendChild(trustEl);
    }

    card.appendChild(statusRow);

    // アクション行（削除ボタン）
    const actions = document.createElement("div");
    actions.className = "karte-card-actions";

    const delBtn = document.createElement("button");
    delBtn.className = "karte-delete-btn";
    delBtn.type = "button";
    delBtn.textContent = "🗑️ 削除";
    delBtn.setAttribute("aria-label", "カルテから削除");
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      _deleteKarteEntry(s.session_id, card);
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);

    // クリックで karte-detail.html へ（セッションデータを state に保存）
    card.addEventListener("click", function () {
      const sessionData = Object.assign({}, s, { apology_status: effectiveStatus });
      StateManager.setPersistent("karteCurrentSession", sessionData);
      window.location.href = "karte-detail.html";
    });

    return card;
  }

  // ── カルテ削除 ────────────────────────────────────────────────────────────
  function _deleteKarteEntry(sessionId, card) {
    try {
      const deletedIds = _getDeletedIds();
      if (!deletedIds.includes(sessionId)) {
        deletedIds.push(sessionId);
        localStorage.setItem("geza_deleted_cases", JSON.stringify(deletedIds));
      }
      card.remove();
      // リストが空になった場合は空状態を表示
      const container = document.getElementById("karte-list-container");
      if (container && !container.querySelector(".karte-card")) {
        container.textContent = "";
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const icon = document.createElement("div");
        icon.className = "empty-state-icon";
        icon.textContent = "📂";
        const text = document.createElement("div");
        text.className = "empty-state-text";
        text.textContent = "まだ謝罪案件がありません。";
        empty.appendChild(icon);
        empty.appendChild(text);
        container.appendChild(empty);
      }
    } catch (e) { /* ignore */ }
  }
  async function _analyzeKarte() {
    const contentEl = document.getElementById("analysis-content");

    // キャッシュ確認
    const cached = StateManager.getPersistent(ANALYSIS_CACHE_KEY);
    if (cached) {
      _renderAnalysis(cached);
      return;
    }

    try {
      const result = await ApiClient.get("/karte/analyze");
      StateManager.setPersistent(ANALYSIS_CACHE_KEY, result);
      _renderAnalysis(result);
    } catch (err) {
      if (contentEl) {
        contentEl.textContent = "";
        const el = document.createElement("div");
        el.style.cssText = "font-size:12px;color:#888;";
        el.textContent = "傾向分析の取得に失敗しました。";  // XSS-01
        contentEl.appendChild(el);
      }
      console.error("analyze-karte error:", err);
    }
  }

  function _renderAnalysis(result) {
    const contentEl = document.getElementById("analysis-content");
    if (!contentEl) return;
    contentEl.textContent = "";

    // コメント
    const comment = document.createElement("div");
    comment.className = "analysis-comment";
    comment.textContent = result.trend_comment || "";  // XSS-01
    contentEl.appendChild(comment);

    // ポイント（弱点・強み）
    const weakPoints   = result.weak_points  || [];
    const strongPoints = result.strong_points || [];
    if (weakPoints.length || strongPoints.length) {
      const points = document.createElement("div");
      points.className = "analysis-points";

      if (weakPoints.length) {
        const grp = document.createElement("div");
        grp.className = "point-group";
        const title = document.createElement("div");
        title.className = "point-group-title";
        title.textContent = "改善ポイント";
        grp.appendChild(title);
        weakPoints.forEach(function (p) {
          const chip = document.createElement("span");
          chip.className = "point-chip weak";
          chip.textContent = p;  // XSS-01
          grp.appendChild(chip);
        });
        points.appendChild(grp);
      }

      if (strongPoints.length) {
        const grp = document.createElement("div");
        grp.className = "point-group";
        const title = document.createElement("div");
        title.className = "point-group-title";
        title.textContent = "評価ポイント";
        grp.appendChild(title);
        strongPoints.forEach(function (p) {
          const chip = document.createElement("span");
          chip.className = "point-chip strong";
          chip.textContent = p;  // XSS-01
          grp.appendChild(chip);
        });
        points.appendChild(grp);
      }

      contentEl.appendChild(points);
    }

    // アドバイス
    if (result.advice) {
      const advice = document.createElement("div");
      advice.className = "analysis-advice";
      advice.textContent = result.advice;  // XSS-01
      contentEl.appendChild(advice);
    }
  }

  // ── ユーティリティ ─────────────────────────────────────────────────────────
  function _degreeColorClass(deg) {
    if (deg >= 165) return "degree-165";
    if (deg >= 135) return "degree-135";
    if (deg >= 100) return "degree-100";
    if (deg >= 75)  return "degree-75";
    if (deg >= 45)  return "degree-45";
    return "degree-0";
  }

  function _statusLabel(status) {
    const MAP = { planned: "📋 計画中", practiced: "🎙️ 練習済み", completed: "✅ 謝罪完了" };
    return MAP[status] || "📋 計画中";
  }

  function _formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch (e) { return iso; }
  }

  // ── エントリポイント ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
