import type { CoachSource } from "./contextualCoach.ts";

export type CoachGroundingGroups = {
  records: CoachSource[];
  evidence: CoachSource[];
  safety: CoachSource[];
};

export function coachSourceKind(source: CoachSource): NonNullable<CoachSource["kind"]> {
  if (source.kind) return source.kind;
  if (source.id === "safety_review" || source.id.startsWith("safety_")) return "safety";
  if (source.id.startsWith("evidence_")) return "evidence";
  return "member_record";
}

export function groupCoachSources(sources: CoachSource[]): CoachGroundingGroups {
  return sources.reduce<CoachGroundingGroups>((groups, source) => {
    const kind = coachSourceKind(source);
    if (kind === "evidence") groups.evidence.push(source);
    else if (kind === "safety") groups.safety.push(source);
    else groups.records.push(source);
    return groups;
  }, { records: [], evidence: [], safety: [] });
}

export function coachGroundingHeadline(groups: CoachGroundingGroups): string {
  const hasRecords = groups.records.length > 0;
  const hasEvidence = groups.evidence.length > 0;
  const hasSafety = groups.safety.length > 0;
  if (hasRecords && hasEvidence && hasSafety) return "Personalized with your saved records, maintained evidence, and safety rules.";
  if (hasRecords && hasEvidence) return "Personalized with your saved records and maintained evidence.";
  if (hasRecords && hasSafety) return "Checked against your saved records and deterministic safety rules.";
  if (hasEvidence && hasSafety) return "Grounded in maintained evidence and deterministic safety rules.";
  if (hasRecords) return "Grounded in the LVE360 records shown below.";
  if (hasEvidence) return "Grounded in the maintained evidence shown below.";
  if (hasSafety) return "Grounded in the deterministic safety sources shown below.";
  return "No grounding sources were attached to this saved response.";
}

export function coachGroundingTitle(groups: CoachGroundingGroups): string {
  return groups.records.length ? "Why this answer fits you" : "How this answer was grounded";
}

export function evidenceReviewLabel(source: CoachSource): string | null {
  if (source.review_status === "review_due") return "Review due";
  if (source.review_status === "invalid") return "Review date unavailable";
  if (!source.reviewed_at) return null;
  const parsed = new Date(`${source.reviewed_at}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Review date unavailable";
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
  return `Reviewed ${date}`;
}
