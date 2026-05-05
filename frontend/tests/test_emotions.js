/**
 * test_emotions.js — EmotionDefinitions の Property-Based Tests（fast-check）
 * 3 つの不変条件を検証:
 *   P1: getById(id).id === id（ID の一貫性）
 *   P2: angerLevel は 0〜100 の整数
 *   P3: getByCategory はカテゴリが一致するものだけを返す
 *
 * 実行: node --experimental-vm-modules node_modules/.bin/jest frontend/tests/
 * または: npx fast-check のスタンドアロン版として実行可能
 */

// fast-check をスタンドアロンで使う場合のブラウザ模倣
if (typeof window === "undefined") {
  global.window = {};
}

// emotions.js のロード（Node.js 環境）
const path = require("path");
eval(require("fs").readFileSync(path.join(__dirname, "../shared/emotions.js"), "utf8"));
const EmotionDefinitions = global.window.EmotionDefinitions;

const fc = require("fast-check");

describe("EmotionDefinitions — Property-Based Tests", () => {
  // 全感情 ID の配列（ arbitrary として使う）
  const allIds = EmotionDefinitions.getAll().map((e) => e.id);
  const idArb = fc.constantFrom(...allIds);

  // P1: getById(id).id === id
  test("P1: getById returns emotion with matching id", () => {
    fc.assert(
      fc.property(idArb, (id) => {
        const emotion = EmotionDefinitions.getById(id);
        return emotion !== null && emotion.id === id;
      }),
      { numRuns: 200 }
    );
  });

  // P2: 全感情の angerLevel は 0〜100 の整数
  test("P2: angerLevel is integer between 0 and 100", () => {
    fc.assert(
      fc.property(idArb, (id) => {
        const emotion = EmotionDefinitions.getById(id);
        if (!emotion) return false;
        return (
          Number.isInteger(emotion.angerLevel) &&
          emotion.angerLevel >= 0 &&
          emotion.angerLevel <= 100
        );
      }),
      { numRuns: 200 }
    );
  });

  // P3: getByCategory はカテゴリが一致するものだけを返す
  test("P3: getByCategory returns only emotions of the given category", () => {
    const categories = EmotionDefinitions.getCategories();
    const catArb = fc.constantFrom(...categories);
    fc.assert(
      fc.property(catArb, (category) => {
        const emotions = EmotionDefinitions.getByCategory(category);
        return emotions.every((e) => e.category === category);
      }),
      { numRuns: 100 }
    );
  });

  // P4: sortedByAnger の順序が単調減少
  test("P4: sortedByAnger returns emotions in non-increasing anger order", () => {
    const sorted = EmotionDefinitions.sortedByAnger();
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].angerLevel).toBeLessThanOrEqual(sorted[i - 1].angerLevel);
    }
  });

  // P5: 全感情に label, color, category が存在する
  test("P5: all emotions have required fields", () => {
    fc.assert(
      fc.property(idArb, (id) => {
        const e = EmotionDefinitions.getById(id);
        return (
          typeof e.label === "string" && e.label.length > 0 &&
          typeof e.color === "string" && e.color.length > 0 &&
          typeof e.category === "string" && e.category.length > 0
        );
      }),
      { numRuns: 200 }
    );
  });
});
