/**
 * anger-gauge.js — GEZA 怒りゲージコンポーネント
 * 怒りレベル(0-100)を視覚的に表示し、変化時にアバターと連動する。
 * XSS 対策: DOM 挿入は textContent のみ。
 */
const AngerGauge = (() => {
  let _elementId = null;
  let _currentLevel = 0;
  const _thresholds = [
    { min: 80, label: "激怒",   cssClass: "anger-furious",  color: "#e53e3e" },
    { min: 60, label: "怒り",   cssClass: "anger-angry",    color: "#f56565" },
    { min: 40, label: "苛立ち", cssClass: "anger-irritated",color: "#fc8181" },
    { min: 20, label: "不満",   cssClass: "anger-annoyed",  color: "#fbd38d" },
    { min: 0,  label: "穏やか", cssClass: "anger-calm",     color: "#68d391" },
  ];

  /**
   * ゲージを初期化する
   * @param {string} elementId - ゲージを描画する要素の ID
   */
  function init(elementId) {
    _elementId = elementId;
    _render(0);
  }

  /**
   * 怒りレベルを更新する
   * @param {number} level - 0〜100 の整数
   */
  function update(level) {
    const clamped = Math.max(0, Math.min(100, Math.floor(level)));
    if (clamped === _currentLevel) return;
    _currentLevel = clamped;
    _render(clamped);
    if (window.AvatarController) {
      AvatarController.setAngerLevel(clamped);
    }
  }

  function getLevel() {
    return _currentLevel;
  }

  function _getThreshold(level) {
    return _thresholds.find((t) => level >= t.min) ?? _thresholds[_thresholds.length - 1];
  }

  function _render(level) {
    const container = document.getElementById(_elementId);
    if (!container) return;

    const threshold = _getThreshold(level);

    // バー要素
    const bar = container.querySelector("[data-testid='anger-gauge-bar']");
    if (bar) {
      bar.style.width = `${level}%`;
      bar.style.backgroundColor = threshold.color;
    }

    // レベル数値
    const valueEl = container.querySelector("[data-testid='anger-gauge-value']");
    if (valueEl) valueEl.textContent = `${level}`;

    // ラベル
    const labelEl = container.querySelector("[data-testid='anger-gauge-label']");
    if (labelEl) labelEl.textContent = threshold.label;
  }

  return { init, update, getLevel };
})();

window.AngerGauge = AngerGauge;
