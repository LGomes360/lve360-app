import { findEvidenceMasterEntry, type SupplementDoseGuidance } from "@/evidence/evidenceMasterLibrary";

export type { SupplementDoseGuidance } from "@/evidence/evidenceMasterLibrary";

export function getSupplementDoseGuidance(name: string): SupplementDoseGuidance | null {
  return findEvidenceMasterEntry(name)?.doseGuidance ?? null;
}

export function formatStartingGuidance(name: string): string | null {
  const entry = getSupplementDoseGuidance(name);
  if (!entry) return null;
  return [
    `An evidence-informed starting point is ${entry.startingDose}.`,
    `Typical range: ${entry.typicalRange}.`,
    `Timing: ${entry.timing}; ${entry.food.toLowerCase()}.`,
    entry.adjustment ? `Adjustment: ${entry.adjustment}.` : null,
    entry.guardrail ? `Guardrail: ${entry.guardrail}.` : null,
    entry.caution ? `Safety note: ${entry.caution}.` : null,
  ].filter(Boolean).join(" ");
}
