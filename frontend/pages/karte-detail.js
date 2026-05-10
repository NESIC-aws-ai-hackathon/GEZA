/**
 * karte-detail.js — GEZA カルテ詳細ページ（読み取り専用）
 *
 * carte.js から StateManager.setPersistent("karteCurrentSession", s) で渡されたデータを表示。
 * XSS-01: ユーザーデータは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  var _session = null;

  // ── 初期化 ────────────────────────────────────────────────────────────────
  function init() {
    if (!AuthModule.requireAuth()) return;

    _session = StateManager.getPersistent("karteCurrentSession");
    if (!_session) {
      window.location.assign("carte.html");
      return;
    }

    _renderHero();
    _renderSummary();
    _renderOpponent();
    _renderPractice();
    _renderActual();
    _renderMailThread();
    _setupButtons();
  }

  // ── ヒーローヘッダー ──────────────────────────────────────────────────────
  function _renderHero() {
    var s = _session;

    // 謝罪角度バッジ
    var deg = s.ai_degree || 0;
    var degreeBadge = document.getElementById("kd-degree-badge");
    if (degreeBadge) {
      degreeBadge.textContent = deg + "°";
      degreeBadge.className = "kd-degree-badge " + _degreeColorClass(deg);
    }

    // ステータスバッジ
    var status = s.apology_status || "planned";
    var statusBadge = document.getElementById("kd-status-badge");
    if (statusBadge) {
      statusBadge.textContent = _statusLabel(status);
      statusBadge.className = "kd-status-badge " + status;
    }

    // タイトル
    _setText("kd-title", s.incident_summary || "謝罪案件");

    // 日付
    _setText("kd-created", "作成: " + _formatDate(s.created_at));
    _setText("kd-updated", "更新: " + _formatDate(s.updated_at));
  }

  // ── 事案概要 ──────────────────────────────────────────────────────────────
  function _renderSummary() {
    _setText("kd-summary", _session.incident_summary || "（概要なし）");
  }

  // ── 相手プロフィール ──────────────────────────────────────────────────────
  function _renderOpponent() {
    var op = _session.opponent_profile;
    var container = document.getElementById("kd-profile-chips");
    if (!container) return;

    if (!op || Object.keys(op).length === 0) {
      var empty = document.createElement("div");
      empty.className = "kd-empty-sub";
      empty.textContent = "相手情報がありません";
      container.appendChild(empty);
      return;
    }

    var chips = [];
    if (op.type)          chips.push("タイプ: " + op.type);
    if (op.anger_level != null) chips.push("怒り度: " + op.anger_level + "%");
    if (op.trust_level != null) chips.push("信頼度: " + op.trust_level + "%");
    if (op.relationship)  chips.push(op.relationship);

    chips.forEach(function (text) {
      var chip = document.createElement("span");
      chip.className = "kd-profile-chip";
      chip.textContent = text;
      container.appendChild(chip);
    });
  }

  // ── リハーサル記録 ────────────────────────────────────────────────────────
  function _renderPractice() {
    var pr = _session.practice_result;
    if (!pr) return;

    var sec = document.getElementById("sec-practice");
    var grid = document.getElementById("kd-practice-grid");
    if (!sec || !grid) return;

    sec.style.display = "block";

    var stats = [
      { label: "最終怒り",  value: pr.final_angry ?? "--",  unit: "%" },
      { label: "最終信頼度", value: pr.final_trust ?? "--",  unit: "%" },
      { label: "ターン数",   value: pr.turn_count  ?? "--",  unit: "回" },
      { label: "NG発言",    value: pr.ng_count    ?? "--",  unit: "件" },
    ];

    stats.forEach(function (s) {
      var card = document.createElement("div");
      card.className = "kd-stat-card";

      var label = document.createElement("div");
      label.className = "kd-stat-label";
      label.textContent = s.label;

      var valWrap = document.createElement("div");
      var val = document.createElement("span");
      val.className = "kd-stat-value";
      val.textContent = s.value;
      var unit = document.createElement("span");
      unit.className = "kd-stat-unit";
      unit.textContent = s.unit;
      valWrap.appendChild(val);
      valWrap.appendChild(unit);

      card.appendChild(label);
      card.appendChild(valWrap);
      grid.appendChild(card);
    });

    // 結果ラベル
    if (pr.session_result) {
      var resultEl = document.createElement("div");
      resultEl.style.cssText = "margin-top:10px; font-size:12px; color:#888; grid-column:1/-1;";
      resultEl.textContent = "結果: " + (pr.session_result === "clear" ? "✅ クリア" : "⚪ 任意終了");
      grid.appendChild(resultEl);
    }
  }

  // ── 実際の謝罪記録 ────────────────────────────────────────────────────────
  function _renderActual() {
    var ar = _session.actual_result;
    if (!ar) return;

    var sec = document.getElementById("sec-actual");
    var content = document.getElementById("kd-actual-content");
    if (!sec || !content) return;

    sec.style.display = "block";

    // 結果バッジ
    var outcomeMap = {
      success:   { label: "✅ 謝罪成功",   cls: "success"   },
      partial:   { label: "🤝 ある程度許してもらえた", cls: "partial" },
      difficult: { label: "😔 難しかった", cls: "difficult" },
    };
    var outcome = outcomeMap[ar.outcome] || { label: ar.outcome || "記録済み", cls: "partial" };

    var badge = document.createElement("div");
    badge.className = "kd-outcome-badge " + outcome.cls;
    badge.textContent = outcome.label;
    content.appendChild(badge);

    // メモ
    if (ar.notes) {
      var notesLabel = document.createElement("div");
      notesLabel.style.cssText = "font-size:11px; color:#777; margin-bottom:4px;";
      notesLabel.textContent = "メモ";
      var notesText = document.createElement("div");
      notesText.className = "kd-text";
      notesText.textContent = ar.notes;
      content.appendChild(notesLabel);
      content.appendChild(notesText);
    }

    // 日時
    if (ar.completed_at) {
      var dateEl = document.createElement("div");
      dateEl.style.cssText = "font-size:11px; color:#555; margin-top:8px;";
      dateEl.textContent = "実施日: " + _formatDate(ar.completed_at);
      content.appendChild(dateEl);
    }
  }

  // ── メールやり取り ────────────────────────────────────────────────────────
  function _renderMailThread() {
    var thread = _session.mail_thread;
    if (!thread || !Array.isArray(thread) || thread.length === 0) return;

    var sec  = document.getElementById("sec-mail");
    var list = document.getElementById("kd-mail-list");
    if (!sec || !list) return;

    sec.style.display = "block";

    thread.forEach(function (mail) {
      var card = document.createElement("div");
      card.className = "kd-mail-card " + (mail.type || "received");

      var labelEl = document.createElement("div");
      labelEl.className = "kd-mail-label";
      labelEl.textContent = mail.type === "sent" ? "📤 送信" : "📨 受信";

      card.appendChild(labelEl);

      if (mail.subject) {
        var subjectEl = document.createElement("div");
        subjectEl.className = "kd-mail-subject";
        subjectEl.textContent = mail.subject;
        card.appendChild(subjectEl);
      }

      var bodyEl = document.createElement("div");
      bodyEl.className = "kd-mail-body";
      bodyEl.textContent = mail.content || "";
      card.appendChild(bodyEl);

      if (mail.timestamp) {
        var timeEl = document.createElement("div");
        timeEl.className = "kd-mail-time";
        timeEl.textContent = _formatDate(mail.timestamp);
        card.appendChild(timeEl);
      }

      list.appendChild(card);
    });
  }

  // ── ボタン設定 ────────────────────────────────────────────────────────────
  function _setupButtons() {
    // 戻るボタン
    var backBtn = document.getElementById("back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        window.location.assign("carte.html");
      });
    }

    // ログアウト
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        AuthModule.signOut();
      });
    }

    // 実案件モードで開く（ローカルキャッシュにある場合のみ表示）
    var btnGoCase = document.getElementById("btn-go-case");
    if (btnGoCase && _session.session_id) {
      try {
        var raw = localStorage.getItem("geza_cases");
        var cases = raw ? JSON.parse(raw) : [];
        var found = cases.find(function (c) { return c.id === _session.session_id; });
        if (found) {
          btnGoCase.style.display = "block";
          btnGoCase.addEventListener("click", function () {
            sessionStorage.setItem("geza_current_case_id", _session.session_id);
            window.location.assign("case-detail.html");
          });
        }
      } catch (e) { /* ignore */ }
    }

    // 削除ボタン
    var btnDelete = document.getElementById("btn-delete");
    if (btnDelete) {
      btnDelete.addEventListener("click", function () {
        if (!confirm("このカルテを削除しますか？")) return;
        try {
          var deletedIds = JSON.parse(localStorage.getItem("geza_deleted_cases") || "[]");
          if (!deletedIds.includes(_session.session_id)) {
            deletedIds.push(_session.session_id);
            localStorage.setItem("geza_deleted_cases", JSON.stringify(deletedIds));
          }
          // ローカルキャッシュからも削除
          var raw = localStorage.getItem("geza_cases");
          if (raw) {
            var cases = JSON.parse(raw).filter(function (c) { return c.id !== _session.session_id; });
            localStorage.setItem("geza_cases", JSON.stringify(cases));
          }
        } catch (e) { /* ignore */ }
        window.location.assign("carte.html");
      });
    }
  }

  // ── ユーティリティ ────────────────────────────────────────────────────────
  function _setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function _statusLabel(status) {
    var MAP = { planned: "📋 計画中", practiced: "🎙️ 練習済み", completed: "✅ 謝罪完了" };
    return MAP[status] || "📋 計画中";
  }

  function _degreeColorClass(deg) {
    if (deg >= 165) return "degree-165";
    if (deg >= 135) return "degree-135";
    if (deg >= 100) return "degree-100";
    if (deg >= 75)  return "degree-75";
    if (deg >= 45)  return "degree-45";
    return "degree-0";
  }

  function _formatDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("ja-JP", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (e) { return iso; }
  }

  // ── エントリポイント ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
