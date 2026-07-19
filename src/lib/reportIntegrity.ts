const DEFAULT_FOCUS_ITEMS = [
  "Add no more than one new supplement this week.",
  "Record sleep quality and morning energy on three days.",
  "Take a 10-minute walk after your largest meal.",
];

const NON_ACTIONABLE_FOCUS_RE = /^(?:this week[, ]+)?(?:try|experiment with|focus on|consider)(?: the following)?\s*:?[\s.]*$/i;

function plainText(value: string): string {
  return String(value ?? "")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFocusItems(raw: string, fallback = DEFAULT_FOCUS_ITEMS): string[] {
  const candidates = String(raw ?? "")
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line))
    .map(plainText)
    .filter((item) =>
      item.length >= 12 &&
      !item.endsWith(":") &&
      !NON_ACTIONABLE_FOCUS_RE.test(item) &&
      !/^analysis\b/i.test(item)
    );
  const unique = Array.from(new Set(candidates));
  for (const item of fallback) {
    if (unique.length >= 3) break;
    if (!unique.includes(item)) unique.push(item);
  }
  return unique.slice(0, 4);
}

export function recommendationRationale(name: string): string | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/^omega 3|fish oil/.test(key)) return "Supports cardiovascular wellness and a healthy inflammatory balance.";
  if (/magnesium.*glycinate/.test(key)) return "Supports relaxation, sleep quality, and normal muscle and nerve function.";
  if (/^(?:vitamin )?b complex|b vitamins?/.test(key)) return "Supports normal energy metabolism and nervous-system function.";
  if (/creatine/.test(key)) return "Supports strength, lean-mass maintenance, high-intensity performance, and cellular energy needs.";
  if (/^glycine/.test(key)) return "Supports sleep quality and recovery as part of the reported evening routine.";
  if (/vitamin d/.test(key)) return "Supports bone, muscle, and immune function; laboratory context can help refine longer-term use.";
  if (/curcumin|turmeric/.test(key)) return "Supports joint comfort and a healthy inflammatory response.";
  if (/coq10|coenzyme q10/.test(key)) return "Supports cellular energy production and cardiovascular wellness.";
  if (/probiotic/.test(key)) return "Supports digestive function; benefits depend on the product's specific strains.";
  if (/psyllium|soluble fiber/.test(key)) return "Supports digestive regularity, satiety, and healthy cholesterol already within the normal range.";
  if (/collagen/.test(key)) return "Provides amino acids that support connective tissue, skin, and joint structure.";
  if (/theanine/.test(key)) return "Supports a calm, focused state and may complement an evening wind-down routine.";
  if (/vitamin b12|^b12/.test(key)) return "Supports normal red-blood-cell formation, nervous-system function, and energy metabolism.";
  return null;
}

export function neutralGoalDescription(goal: string): string {
  const value = goal.toLowerCase();
  if (/weight|body composition|fat loss/.test(value)) return "Support sustainable weight management while maintaining energy and lean mass.";
  if (/sleep/.test(value)) return "Build a consistent routine that supports sleep quality and next-day energy.";
  if (/muscle|strength/.test(value)) return "Support strength, recovery, and maintenance of lean mass.";
  if (/cogn|focus|memory|brain/.test(value)) return "Support focus, memory, and consistent cognitive performance.";
  if (/inflam|joint/.test(value)) return "Support joint comfort and a healthy inflammatory balance.";
  if (/longevity|aging/.test(value)) return "Build sustainable habits that support long-term function and resilience.";
  if (/energy|fatigue/.test(value)) return "Support steadier daytime energy and recovery.";
  return "Make measurable, sustainable progress toward this stated wellness priority.";
}

