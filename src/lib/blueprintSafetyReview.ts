import { healthItemIdentityKey } from "./healthItemIdentity.ts";
import { parseMarkdownToItems } from "./parseMarkdownToItems.ts";
import { isEligibleSupplementName, isMedicationOrHormoneName } from "./supplementEligibility.ts";
import type { SafetyCandidate } from "./safetyEngine.ts";

/** Recheck report ideas as well as the live routine; exact current identities win. */
export function blueprintSafetyCandidates(
  reportMarkdown: string,
  currentCandidates: SafetyCandidate[],
): SafetyCandidate[] {
  const candidates = new Map<string, SafetyCandidate>();
  for (const item of currentCandidates) {
    const key = healthItemIdentityKey(item.name);
    if (key) candidates.set(key, { ...item, is_current: true });
  }
  for (const item of parseMarkdownToItems(reportMarkdown)) {
    const key = healthItemIdentityKey(item.name);
    if (!key || candidates.has(key) || item.is_current !== false
      || !isEligibleSupplementName(item.name) || isMedicationOrHormoneName(item.name)) continue;
    candidates.set(key, { name: item.name, dose: item.dose, is_current: false });
  }
  return [...candidates.values()];
}
