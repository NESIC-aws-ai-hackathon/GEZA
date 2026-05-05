/**
 * avatar.js — GEZA アバターコントローラー
 * facesjs を使って SVG アバターを生成・表示し、感情アニメーションを制御する。
 * XSS 対策: innerHTML は facesjs 内部が生成する SVG のみ（ユーザー入力を渡さない）。
 */
const AvatarController = (() => {
  let _containerId = null;
  let _currentFace = null;
  let _animationTimer = null;

  /**
   * アバターを初期化する
   * @param {string} containerId - SVG を挿入する要素の ID
   * @param {object} faceConfig - facesjs の設定オブジェクト（省略時はランダム生成）
   */
  function init(containerId, faceConfig = null) {
    _containerId = containerId;
    _currentFace = faceConfig ?? window.facesjs.generate();
    _render();
  }

  /** 感情に合わせた表情を設定する */
  function setEmotion(emotionKey) {
    if (!_currentFace) return;
    const overrides = _emotionOverrides(emotionKey);
    const updated = window.faces.override(_currentFace, overrides);
    _currentFace = updated;
    _render();
  }

  /** 怒り度合いに合わせて表情を更新する（0-100） */
  function setAngerLevel(level) {
    if (level >= 80) setEmotion("furious");
    else if (level >= 60) setEmotion("angry");
    else if (level >= 40) setEmotion("irritated");
    else if (level >= 20) setEmotion("neutral");
    else setEmotion("calm");
  }

  /** アニメーション（まばたき）を開始する */
  function startAnimation() {
    if (_animationTimer) return;
    _animationTimer = setInterval(() => {
      if (!_currentFace) return;
      const blink = window.facesjs.override(_currentFace, { eye: { id: "eye-closed" } });
      _renderFace(blink);
      setTimeout(() => _render(), 150);
    }, 3000 + Math.random() * 2000);
  }

  /** アニメーションを停止する */
  function stopAnimation() {
    if (_animationTimer) {
      clearInterval(_animationTimer);
      _animationTimer = null;
    }
  }

  function _render() {
    if (!_containerId || !_currentFace) return;
    _renderFace(_currentFace);
  }

  function _renderFace(face) {
    const container = document.getElementById(_containerId);
    if (!container) return;
    // facesjs が生成する SVG を直接挿入（ユーザー入力は一切含まない）
    window.facesjs.display(_containerId, face);
  }

  function _emotionOverrides(emotionKey) {
    const map = {
      calm:       { mouth: { id: "mouth-smile" } },
      neutral:    { mouth: { id: "mouth-neutral" } },
      irritated:  { mouth: { id: "mouth-frown" }, eyebrow: { id: "eyebrow-angry" } },
      angry:      { mouth: { id: "mouth-frown" }, eyebrow: { id: "eyebrow-angry" }, eye: { id: "eye-angry" } },
      furious:    { mouth: { id: "mouth-open" }, eyebrow: { id: "eyebrow-angry" }, eye: { id: "eye-angry" } },
      sad:        { mouth: { id: "mouth-sad" }, eyebrow: { id: "eyebrow-sad" } },
      surprised:  { mouth: { id: "mouth-open" }, eye: { id: "eye-surprised" } },
    };
    return map[emotionKey] ?? {};
  }

  return { init, setEmotion, setAngerLevel, startAnimation, stopAnimation };
})();

window.AvatarController = AvatarController;
