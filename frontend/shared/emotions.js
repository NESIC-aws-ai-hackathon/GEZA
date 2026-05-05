/**
 * emotions.js — GEZA 感情定義モジュール
 * 200 感情 / 15 カテゴリ（MVP: 代表 30 感情 + 残りはプレースホルダー）
 * 各感情: { id, label, category, angerLevel(0-100), color }
 */
const EmotionDefinitions = (() => {
  const CATEGORIES = [
    "怒り",       // anger
    "悲しみ",     // sadness
    "恐怖",       // fear
    "嫌悪",       // disgust
    "驚き",       // surprise
    "喜び",       // joy
    "期待",       // anticipation
    "信頼",       // trust
    "不安",       // anxiety
    "恥",         // shame
    "罪悪感",     // guilt
    "後悔",       // regret
    "混乱",       // confusion
    "諦め",       // resignation
    "希望",       // hope
  ];

  // 代表感情（MVP 実装済み: 30件）
  const CORE_EMOTIONS = [
    { id: "furious",        label: "激怒",     category: "怒り",   angerLevel: 95, color: "#e53e3e" },
    { id: "angry",          label: "怒り",     category: "怒り",   angerLevel: 80, color: "#f56565" },
    { id: "irritated",      label: "苛立ち",   category: "怒り",   angerLevel: 60, color: "#fc8181" },
    { id: "annoyed",        label: "不満",     category: "怒り",   angerLevel: 45, color: "#feb2b2" },
    { id: "frustrated",     label: "不満足",   category: "怒り",   angerLevel: 50, color: "#fed7d7" },
    { id: "heartbroken",    label: "悲嘆",     category: "悲しみ", angerLevel: 10, color: "#4299e1" },
    { id: "sad",            label: "悲しみ",   category: "悲しみ", angerLevel: 15, color: "#63b3ed" },
    { id: "disappointed",   label: "失望",     category: "悲しみ", angerLevel: 20, color: "#90cdf4" },
    { id: "lonely",         label: "孤独",     category: "悲しみ", angerLevel: 10, color: "#bee3f8" },
    { id: "scared",         label: "恐怖",     category: "恐怖",   angerLevel: 5,  color: "#9f7aea" },
    { id: "anxious",        label: "不安",     category: "不安",   angerLevel: 30, color: "#b794f4" },
    { id: "worried",        label: "心配",     category: "不安",   angerLevel: 25, color: "#d6bcfa" },
    { id: "disgusted",      label: "嫌悪",     category: "嫌悪",   angerLevel: 55, color: "#68d391" },
    { id: "surprised",      label: "驚き",     category: "驚き",   angerLevel: 10, color: "#f6e05e" },
    { id: "shocked",        label: "衝撃",     category: "驚き",   angerLevel: 20, color: "#fefcbf" },
    { id: "happy",          label: "喜び",     category: "喜び",   angerLevel: 0,  color: "#f6ad55" },
    { id: "relieved",       label: "安堵",     category: "喜び",   angerLevel: 0,  color: "#fbd38d" },
    { id: "hopeful",        label: "希望",     category: "希望",   angerLevel: 0,  color: "#ffeaa7" },
    { id: "ashamed",        label: "羞恥",     category: "恥",     angerLevel: 15, color: "#fc8181" },
    { id: "embarrassed",    label: "恥ずかしい", category: "恥",   angerLevel: 10, color: "#feb2b2" },
    { id: "guilty",         label: "罪悪感",   category: "罪悪感", angerLevel: 5,  color: "#9ae6b4" },
    { id: "remorseful",     label: "後悔",     category: "後悔",   angerLevel: 5,  color: "#c6f6d5" },
    { id: "regretful",      label: "悔恨",     category: "後悔",   angerLevel: 10, color: "#68d391" },
    { id: "confused",       label: "混乱",     category: "混乱",   angerLevel: 20, color: "#76e4f7" },
    { id: "overwhelmed",    label: "圧倒",     category: "混乱",   angerLevel: 35, color: "#0bc5ea" },
    { id: "resigned",       label: "諦め",     category: "諦め",   angerLevel: 5,  color: "#a0aec0" },
    { id: "neutral",        label: "普通",     category: "驚き",   angerLevel: 0,  color: "#e2e8f0" },
    { id: "calm",           label: "穏やか",   category: "喜び",   angerLevel: 0,  color: "#c6f6d5" },
    { id: "trusting",       label: "信頼",     category: "信頼",   angerLevel: 0,  color: "#9ae6b4" },
    { id: "anticipating",   label: "期待",     category: "期待",   angerLevel: 5,  color: "#fefcbf" },
  ];

  /** 全感情リストを返す */
  function getAll() {
    return CORE_EMOTIONS.slice();
  }

  /** ID で感情を取得する */
  function getById(id) {
    return CORE_EMOTIONS.find((e) => e.id === id) ?? null;
  }

  /** カテゴリで絞り込む */
  function getByCategory(category) {
    return CORE_EMOTIONS.filter((e) => e.category === category);
  }

  /** angerLevel でソートした感情リストを返す（高い順） */
  function sortedByAnger() {
    return CORE_EMOTIONS.slice().sort((a, b) => b.angerLevel - a.angerLevel);
  }

  /** 全カテゴリ一覧を返す */
  function getCategories() {
    return CATEGORIES.slice();
  }

  return { getAll, getById, getByCategory, sortedByAnger, getCategories };
})();

window.EmotionDefinitions = EmotionDefinitions;
