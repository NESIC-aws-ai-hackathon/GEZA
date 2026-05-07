/**
 * feedback.js — GEZA FeedbackPageController（U3）
 *
 * 依存: config.js / auth.js / state.js / api.js
 * XSS-01: AI 生成テキストは全て textContent で挿入
 * AUTH: requireAuth() で認証ガード
 */
(function () {
  "use strict";

  async function init() {
    if (!AuthModule.requireAuth()) return;

    // sessionStorage から練習結果を読み取り
    const feedbackData = StateManager.getPersistent("practiceResult");

    if (!feedbackData) {
      document.getElementById("feedback-content").innerHTML = "";
      const card = document.createElement("div");
      card.className = "error-card";
      card.textContent = "練習データが見つかりません。まずリハーサルモードで練習してください。";
      document.getElementById("feedback-content").appendChild(card);
      return;
    }

    // スコアサマリー表示
    _renderScoreSummary(feedbackData);

    // ボタンバインド
    document.getElementById("btn-retry").addEventListener("click", () => {
      StateManager.removePersistent("practiceResult");
      window.location.href = "practice.html";
    });
    document.getElementById("btn-top").addEventListener("click", () => {
      window.location.href = "../index.html";
    });

    // フィードバック生成（feedback.html 表示直後に自動呼び出し）
    await _loadAndRenderFeedback(feedbackData);
  }

  // ── スコアサマリー描画 ────────────────────────────────────────────────────
  function _renderScoreSummary(data) {
    document.getElementById("final-anger").textContent = data.finalAngryScore ?? "--";
    document.getElementById("final-trust").textContent = data.finalTrustScore ?? "--";
    document.getElementById("turn-count").textContent  = data.turnCount ?? "--";
    document.getElementById("ng-count").textContent    = `${data.ngWordCount ?? 0}件`;

    const badge = document.getElementById("result-badge");
    if (data.sessionResult === "clear") {
      badge.className = "result-badge clear";
      badge.textContent = "✅ クリア！";
    } else {
      badge.className = "result-badge give_up";
      badge.textContent = "⚪ 任意終了";
    }
  }

  // ── generate-feedback API 呼び出し → 描画 ────────────────────────────────
  async function _loadAndRenderFeedback(data) {
    const container = document.getElementById("feedback-content");

    try {
      const result = await ApiClient.post("/feedback/generate", {
        conversation_history: data.conversationHistory ?? [],
        opponent_profile:     data.opponentProfile ?? {},
        final_angry_score:    data.finalAngryScore ?? 50,
        final_trust_score:    data.finalTrustScore ?? 30,
      });

      container.innerHTML = "";

      // 問題点リスト
      if (result.problems?.length) {
        const section = document.createElement("div");
        section.className = "section";
        const title = document.createElement("div");
        title.className = "section-title";
        title.textContent = "気づいた問題点";
        section.appendChild(title);
        const ul = document.createElement("ul");
        ul.className = "problems-list";
        result.problems.forEach((prob) => {
          const li = document.createElement("li");
          li.textContent = prob;
          ul.appendChild(li);
        });
        section.appendChild(ul);
        container.appendChild(section);
      }

      // 改善謝罪文
      if (result.improved_apology_text) {
        const section = document.createElement("div");
        section.className = "section";
        const title = document.createElement("div");
        title.className = "section-title";
        title.textContent = "AI 改善謝罪文";
        section.appendChild(title);
        const card = document.createElement("div");
        card.className = "improved-text-card";
        card.textContent = result.improved_apology_text;
        section.appendChild(card);
        container.appendChild(section);
      }

      // 総評
      if (result.overall_comment) {
        const section = document.createElement("div");
        section.className = "section";
        const title = document.createElement("div");
        title.className = "section-title";
        title.textContent = "総評";
        section.appendChild(title);
        const card = document.createElement("div");
        card.className = "overall-card";
        card.textContent = result.overall_comment;
        section.appendChild(card);
        container.appendChild(section);
      }

    } catch (err) {
      container.innerHTML = "";
      const card = document.createElement("div");
      card.className = "error-card";
      card.textContent = `フィードバックの生成に失敗しました: ${err.message}`;
      container.appendChild(card);
      console.error("generate-feedback error:", err);
    }
  }

  // ── エントリポイント ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
