import { getEvidenceEntriesFor } from "@/lib/evidence";
import {
  EVIDENCE_MASTER_LIBRARY,
  evidenceReviewStatus,
  type EvidenceStrength,
  type SupplementDoseGuidance,
} from "@/evidence/evidenceMasterLibrary";

export type CoachEvidenceStrength = EvidenceStrength;

export type CoachEvidenceOption = {
  id: string;
  name: string;
  bestFit: string;
  evidenceStrength: CoachEvidenceStrength;
  evidenceSummary: string;
  citationLabel: string;
  citationUrl: string;
  lastReviewed: string;
  reviewStatus: "current" | "review_due" | "invalid";
  safetyTopics: string[];
  safetySummary: string;
  doseGuidance: SupplementDoseGuidance | null;
};

export function coachQuestionTopics(question: string): string[] {
  const value = question.toLowerCase();
  return [
    /\b(?:sleep|insomnia|bedtime|fall asleep|stay asleep|wake up)\b/.test(value) ? "sleep" : null,
    /\b(?:energy|fatigue|tired|vitality)\b/.test(value) ? "energy" : null,
    /\b(?:exercise|workout|training|strength|muscle)\b/.test(value) ? "exercise" : null,
    /\b(?:recovery|sore|rebuild)\b/.test(value) ? "recovery" : null,
    /\b(?:focus|attention|concentration)\b/.test(value) ? "focus" : null,
    /\b(?:cognition|cognitive|memory|brain)\b/.test(value) ? "cognition" : null,
    /\b(?:stress|anxiety|calm|wind down)\b/.test(value) ? "stress" : null,
    /\b(?:heart|cardiovascular|cholesterol|triglyceride)\b/.test(value) ? "heart" : null,
  ].filter((topic): topic is string => Boolean(topic));
}

export function retrieveCoachEvidence(question: string, limit = 4): CoachEvidenceOption[] {
  const topics = coachQuestionTopics(question);
  const coachingEntries = EVIDENCE_MASTER_LIBRARY.filter((entry) => entry.evidenceStrength && entry.bestFit && entry.evidenceSummary);
  const explicit = coachingEntries.filter((entry) => entry.aliases.test(question));
  const topical = topics.length
    ? coachingEntries.filter((entry) => entry.topics.some((topic) => topics.includes(topic)))
    : [];
  const entries = [...explicit, ...topical].filter((entry, index, values) =>
    values.findIndex((candidate) => candidate.id === entry.id) === index
  ).slice(0, limit);

  return entries.flatMap((entry) => {
    const evidence = getEvidenceEntriesFor(entry.citationLookup, 1)[0];
    if (!evidence) return [];
    return [{
      id: entry.id,
      name: entry.name,
      bestFit: entry.bestFit!,
      evidenceStrength: entry.evidenceStrength!,
      evidenceSummary: entry.evidenceSummary!,
      citationLabel: [evidence.journal, evidence.year].filter(Boolean).join(" · ") || "LVE360 curated evidence",
      citationUrl: evidence.url,
      lastReviewed: entry.lastReviewed,
      reviewStatus: evidenceReviewStatus(entry),
      safetyTopics: entry.safetyTopics,
      safetySummary: entry.safetySummary,
      doseGuidance: entry.doseGuidance ?? null,
    }];
  });
}

export function evidenceOptionByName(options: CoachEvidenceOption[], name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return options.find((option) => {
    const candidate = option.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  }) ?? null;
}
