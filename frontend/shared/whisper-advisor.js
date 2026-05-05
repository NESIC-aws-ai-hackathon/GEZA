/**
 * whisper-advisor.js — GEZA ウィスパーアドバイザー
 * 謝罪練習中にリアルタイムで短いアドバイスをオーバーレイ表示する。
 * XSS 対策: DOM 挿入は textContent のみ。
 */
const WhisperAdvisor = (() => {
  let _containerId = null;
  let _hideTimer = null;
  const _DISPLAY_MS = 4000;

  const _TIPS = {
    start: [
      "まず「申し訳ありませんでした」と明確に伝えましょう",
      "相手の目を見て話すことが大切です",
      "言い訳から始めないよう注意しましょう",
    ],
    tooLong: [
      "話が長くなっています。要点を絞りましょう",
      "相手が話すターンを作りましょう",
    ],
    noApology: [
      "謝罪の言葉が聞こえていません",
      "「すみません」「申し訳ない」という言葉を使いましょう",
    ],
    highAnger: [
      "相手はまだ怒っています。焦らず聞き続けましょう",
      "今は謝罪より傾聴が重要です",
    ],
    lowAnger: [
      "相手が落ち着いてきました。解決策を提案するチャンスです",
    ],
    goodProgress: [
      "良い流れです！この調子で続けましょう",
      "相手が聞いてくれています。具体的な対応を伝えましょう",
    ],
  };

  /**
   * アドバイザーを初期化する
   * @param {string} containerId - アドバイスを表示する要素の ID
   */
  function init(containerId) {
    _containerId = containerId;
  }

  /**
   * 状況に応じたアドバイスを表示する
   * @param {string} tipCategory - _TIPS のキー
   */
  function show(tipCategory) {
    const tips = _TIPS[tipCategory];
    if (!tips || tips.length === 0) return;
    const tip = tips[Math.floor(Math.random() * tips.length)];
    _display(tip);
  }

  /** 任意のメッセージを表示する */
  function showMessage(message) {
    _display(message);
  }

  /** 非表示にする */
  function hide() {
    const container = document.getElementById(_containerId);
    if (!container) return;
    container.classList.add("whisper-hidden");
  }

  function _display(text) {
    const container = document.getElementById(_containerId);
    if (!container) return;

    const msgEl = container.querySelector("[data-testid='whisper-message']");
    if (msgEl) msgEl.textContent = text;  // XSS-01: textContent 使用

    container.classList.remove("whisper-hidden");

    if (_hideTimer) clearTimeout(_hideTimer);
    _hideTimer = setTimeout(hide, _DISPLAY_MS);
  }

  return { init, show, showMessage, hide };
})();

window.WhisperAdvisor = WhisperAdvisor;
