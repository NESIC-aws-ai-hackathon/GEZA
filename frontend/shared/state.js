/**
 * state.js — GEZA ステート管理（3層）
 * Layer 1: セッションストレージ（ページをまたぐ状態）
 * Layer 2: メモリ内グローバル状態（SPA 内部）
 * Layer 3: UI 状態（コンポーネントローカル）
 * セキュリティ: 個人情報を sessionStorage に保存する場合はユーザー確認を取ること。
 */
const StateManager = (() => {
  const _PREFIX = "geza_state_";
  const _memoryState = {};
  const _subscribers = {};

  // ---- Layer 1: セッションストレージ ----
  function setPersistent(key, value) {
    sessionStorage.setItem(`${_PREFIX}${key}`, JSON.stringify(value));
  }

  function getPersistent(key) {
    const raw = sessionStorage.getItem(`${_PREFIX}${key}`);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function removePersistent(key) {
    sessionStorage.removeItem(`${_PREFIX}${key}`);
  }

  // ---- Layer 2: メモリ内グローバル ----
  function set(key, value) {
    const prev = _memoryState[key];
    _memoryState[key] = value;
    if (prev !== value) _notify(key, value);
  }

  function get(key, defaultValue = null) {
    return Object.prototype.hasOwnProperty.call(_memoryState, key)
      ? _memoryState[key]
      : defaultValue;
  }

  /** 状態変化を購読する */
  function subscribe(key, callback) {
    if (!_subscribers[key]) _subscribers[key] = [];
    _subscribers[key].push(callback);
    return () => {
      _subscribers[key] = _subscribers[key].filter((cb) => cb !== callback);
    };
  }

  function _notify(key, value) {
    (_subscribers[key] ?? []).forEach((cb) => {
      try {
        cb(value);
      } catch (e) {
        console.error("StateManager subscriber error", e);
      }
    });
  }

  /** 全セッション状態をクリア（ログアウト時） */
  function clearAll() {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(_PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
    Object.keys(_memoryState).forEach((k) => delete _memoryState[k]);
  }

  return {
    setPersistent,
    getPersistent,
    removePersistent,
    set,
    get,
    subscribe,
    clearAll,
  };
})();

/** practice ネームスペース（U3 リハーサルモード用セッション状態） */
StateManager.practice = {
  conversationHistory: [],
  currentAngryScore: 0,
  currentTrustScore: 0,
  turnCount: 0,
  consecutiveErrors: 0,
  sessionResult: null,
  sessionId: null,
};

window.StateManager = StateManager;
