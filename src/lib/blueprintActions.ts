import type { BlueprintReport } from "./blueprintReport";

export type BlueprintActionCategory =
  | "movement"
  | "nutrition"
  | "sleep"
  | "mindset"
  | "relationships"
  | "focus"
  | "lifestyle";

export type BlueprintActionCandidate = {
  id: string;
  label: string;
  category: BlueprintActionCategory;
  kind: "lifestyle" | "review_only";
  source: "report" | "legacy_fallback";
};

const SAFETY_SENSITIVE_RE = /\b(?:supplement|vitamin|magnesium|creatine|omega[- ]?3|fish oil|ashwagandha|melatonin|probiotic|medication|medicine|prescription|dose|dosage|capsule|tablet|softgel|clinician|physician|doctor|pharmacist|blood test|lab(?:oratory)?|\d+(?:\.\d+)?\s*(?:mg|mcg|µg|iu))\b/i;

function categoryFor(label: string): BlueprintActionCategory {
  if (/\b(?:walk|steps?|exercise|workout|strength|cardio|movement|mobility|stretch)\b/i.test(label)) return "movement";
  if (/\b(?:meal|food|protein|fiber|vegetable|fruit|water|hydrate|nutrition|eat)\b/i.test(label)) return "nutrition";
  if (/\b(?:sleep|bed|wake|wind[- ]?down|evening|morning light)\b/i.test(label)) return "sleep";
  if (/\b(?:relationship|friend|family|partner|connect|conversation|gratitude)\b/i.test(label)) return "relationships";
  if (/\b(?:focus|deep work|career|learn|read|cognitive|screen)\b/i.test(label)) return "focus";
  if (/\b(?:stress|breath|meditat|journal|reflect|mindful|emotion)\b/i.test(label)) return "mindset";
  return "lifestyle";
}

export function isSafetySensitiveBlueprintAction(label: string): boolean {
  return SAFETY_SENSITIVE_RE.test(label);
}

export function buildBlueprintActionCandidates(report: BlueprintReport): BlueprintActionCandidate[] {
  if (report.focusItems.length === 0) {
    return [{
      id: `${report.contentHash}:fallback`,
      label: "Choose one small lifestyle action from your Blueprint during onboarding.",
      category: "lifestyle",
      kind: "lifestyle",
      source: "legacy_fallback",
    }];
  }

  const candidates: BlueprintActionCandidate[] = report.focusItems.map((label, index) => ({
    id: `${report.contentHash}:${index}`,
    label,
    category: categoryFor(label),
    kind: isSafetySensitiveBlueprintAction(label) ? "review_only" : "lifestyle",
    source: "report",
  }));

  if (candidates.every((candidate) => candidate.kind === "review_only")) {
    candidates.push({
      id: `${report.contentHash}:fallback`,
      label: "Choose one small lifestyle action from your Blueprint during onboarding.",
      category: "lifestyle",
      kind: "lifestyle",
      source: "legacy_fallback",
    });
  }

  return candidates;
}
