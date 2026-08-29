import type { ExperimentBlueprintContext } from "./blueprintContext.ts";
import type { JourneyExperiment, JourneyReview, JourneySynthesis } from "./journey.ts";
import type { PracticeConnectionContext } from "./practiceConnection.ts";

export type JourneyGroundingSource = {
  kind: "practice" | "reflection" | "check_in" | "history" | "connection";
  label: string;
  detail: string;
  href: string;
  status?: "current" | "historical" | "needs_review";
};

export type JourneySynthesisGrounding = {
  title: "What this weekly learning used";
  summary: string;
  confidence: JourneySynthesis["confidence"];
  confidenceLabel: "Early signal" | "Moderate pattern";
  sources: JourneyGroundingSource[];
  methodNote: string;
};

type GroundingInput = {
  experiment: Pick<JourneyExperiment, "action_label">;
  review: Pick<JourneyReview, "completion_count" | "target_count" | "difficulty" | "value_rating">;
  synthesis?: Pick<JourneySynthesis, "confidence" | "evidence"> | null;
  connection: PracticeConnectionContext | null;
  blueprintContext: ExperimentBlueprintContext | null;
};

const EVIDENCE_LABELS = new Set([
  "Practice completions",
  "Exercise volume",
  "Difficulty reflection",
  "Usefulness reflection",
  "Daily check-ins",
  "Average sleep check-in",
  "Average energy check-in",
  "Member-reported context",
  "History considered",
  "Comparable focus history",
  "Comparable completion trend",
  "Comparable usefulness trend",
]);

function cleanText(value: unknown, maximum = 240): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/\s+/g, " ").trim().slice(0, maximum) || null;
}

function safeEvidenceValue(label: string, value: string): string | null {
  if (label !== "Member-reported context") return value;
  const count = value.match(/^(\d{1,3})\s+notes?\b/i)?.[1];
  if (!count) return null;
  return `${count} ${count === "1" ? "note" : "notes"} considered without assuming cause`;
}

function evidenceDetail(
  evidence: JourneySynthesis["evidence"],
  labels: string[],
): string | null {
  const allowed = new Set(labels);
  const details = (Array.isArray(evidence) ? evidence : [])
    .flatMap((item) => {
      const label = cleanText(item?.label, 80);
      const value = cleanText(item?.value);
      if (!label || !value || !EVIDENCE_LABELS.has(label) || !allowed.has(label)) return [];
      const safeValue = safeEvidenceValue(label, value);
      return safeValue ? [`${label}: ${safeValue}`] : [];
    });
  return details.length ? details.join(" · ") : null;
}

function connectionStatus(
  connection: PracticeConnectionContext,
  blueprintContext: ExperimentBlueprintContext | null,
): JourneyGroundingSource["status"] {
  if (blueprintContext?.needs_review || connection.goal?.status === "unresolved" || connection.blueprint?.status === "unresolved") {
    return "needs_review";
  }
  if (connection.goal?.status === "historical" || connection.blueprint?.status === "historical") return "historical";
  return "current";
}

export function journeySynthesisGrounding(input: GroundingInput): JourneySynthesisGrounding {
  const sources: JourneyGroundingSource[] = [];
  const evidence = input.synthesis?.evidence ?? [];
  const confidence = input.synthesis?.confidence ?? "low";
  const practice = cleanText(input.experiment.action_label) ?? "Weekly practice";
  const practiceEvidence = evidenceDetail(evidence, ["Practice completions", "Exercise volume"])
    ?? `Practice completions: ${input.review.completion_count} of ${input.review.target_count} planned`;
  sources.push({
    kind: "practice",
    label: "Practice reviewed",
    detail: `${practice} · ${practiceEvidence}`,
    href: "#journey-week-history",
  });

  const reflectionEvidence = evidenceDetail(evidence, ["Difficulty reflection", "Usefulness reflection"])
    ?? [
      typeof input.review.difficulty === "number" ? `Difficulty reflection: ${input.review.difficulty} of 5` : null,
      typeof input.review.value_rating === "number" ? `Usefulness reflection: ${input.review.value_rating} of 5` : null,
    ].filter((value): value is string => Boolean(value)).join(" · ");
  if (reflectionEvidence) {
    sources.push({
      kind: "reflection",
      label: "Weekly reflection",
      detail: reflectionEvidence,
      href: "#journey-reflections",
    });
  }

  const checkInEvidence = evidenceDetail(evidence, [
    "Daily check-ins",
    "Average sleep check-in",
    "Average energy check-in",
    "Member-reported context",
  ]);
  if (checkInEvidence) {
    sources.push({
      kind: "check_in",
      label: "Daily check-ins",
      detail: checkInEvidence,
      href: "#journey-check-in-patterns",
    });
  }

  const historyEvidence = evidenceDetail(evidence, [
    "History considered",
    "Comparable focus history",
    "Comparable completion trend",
    "Comparable usefulness trend",
  ]);
  if (historyEvidence) {
    sources.push({
      kind: "history",
      label: "Prior weeks considered",
      detail: historyEvidence,
      href: "#journey-week-history",
    });
  }

  if (input.connection && input.connection.type !== "independent") {
    const href = input.connection.blueprint && input.blueprintContext?.source_stack_id
      ? `/blueprints/${encodeURIComponent(input.blueprintContext.source_stack_id)}`
      : input.connection.goal
        ? "/onboarding"
        : "#journey-blueprint-context";
    sources.push({
      kind: "connection",
      label: input.connection.type === "both"
        ? "Goal and Blueprint connection"
        : input.connection.blueprint
          ? "Blueprint connection"
          : "Saved goal connection",
      detail: input.connection.summary,
      href,
      status: connectionStatus(input.connection, input.blueprintContext),
    });
  }

  return {
    title: "What this weekly learning used",
    summary: sources.some((source) => source.kind === "connection")
      ? "This story uses only the saved practice, reflection, check-in, history, and connection records shown below."
      : "This story uses only the saved practice, reflection, check-in, and history records available for this review.",
    confidence,
    confidenceLabel: confidence === "moderate" ? "Moderate pattern" : "Early signal",
    sources,
    methodNote: "The working hypothesis is a possibility to test, not proof that the practice caused a health outcome.",
  };
}
