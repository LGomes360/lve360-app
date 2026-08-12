import { deriveBlueprintSafetyStatus, type BlueprintSafetyStatus } from "./blueprintSafetyStatus.ts";
import { healthItemIdentityKey } from "./healthItemIdentity.ts";
import { parseMarkdownToItems } from "./parseMarkdownToItems.ts";

export type BlueprintDeltaKind = "added" | "changed" | "removed" | "unchanged";
export type BlueprintDeltaAttention = "decision" | "clinician_review" | "informational";

export type BlueprintRecommendationSnapshot = {
  key: string;
  name: string;
  status: string | null;
  dose: string | null;
  timing: string | null;
  rationale: string | null;
};

export type BlueprintRecommendationDelta = {
  key: string;
  name: string;
  kind: BlueprintDeltaKind;
  attention: BlueprintDeltaAttention;
  changedFields: Array<"name" | "status" | "dose" | "timing" | "rationale">;
  previous: BlueprintRecommendationSnapshot | null;
  current: BlueprintRecommendationSnapshot | null;
  explanation: string;
  actionHref: string;
  actionLabel: string;
};

export type BlueprintDelta = {
  previousStackId: string;
  previousCreatedAt: string | null;
  currentCreatedAt: string | null;
  generationReason: string | null;
  recommendations: BlueprintRecommendationDelta[];
  counts: Record<BlueprintDeltaKind, number>;
  safety: {
    previousStatus: BlueprintSafetyStatus;
    currentStatus: BlueprintSafetyStatus;
    changed: boolean;
    needsReview: boolean;
    explanation: string;
  };
};

type BuildBlueprintDeltaInput = {
  previousStackId: string;
  previousCreatedAt: string | null;
  currentCreatedAt: string | null;
  generationReason: string | null;
  previousMarkdown: string;
  currentMarkdown: string;
};

const REPORT_STATUS_PREFIX = /^Blueprint status:\s*/i;

function cleanValue(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function comparisonValue(value: string | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.*_`#]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function reportStatus(notes: string | null | undefined): string | null {
  return cleanValue(String(notes ?? "").replace(REPORT_STATUS_PREFIX, ""));
}

export function extractBlueprintRecommendationSnapshots(markdown: string): BlueprintRecommendationSnapshot[] {
  const snapshots = parseMarkdownToItems(markdown)
    // A recommendation-table row may also appear in Current Stack and will
    // therefore be marked current by the shared report parser. The explicit
    // Blueprint status prefix is the authoritative signal that the row came
    // from the recommendations table.
    .filter((item) => REPORT_STATUS_PREFIX.test(item.notes ?? ""))
    .map((item) => ({
      key: healthItemIdentityKey(item.name),
      name: cleanValue(item.name) ?? "Recommendation",
      status: reportStatus(item.notes),
      dose: cleanValue(item.dose),
      timing: cleanValue(item.timing_text || item.timing),
      rationale: cleanValue(item.rationale),
    }))
    .filter((item) => Boolean(item.key));

  const byKey = new Map<string, BlueprintRecommendationSnapshot>();
  for (const snapshot of snapshots) {
    if (!byKey.has(snapshot.key)) byKey.set(snapshot.key, snapshot);
  }
  return [...byKey.values()];
}

function attentionFor(
  kind: BlueprintDeltaKind,
  current: BlueprintRecommendationSnapshot | null,
): BlueprintDeltaAttention {
  if (kind === "removed" || kind === "unchanged") return "informational";
  if (/clinician review/i.test(current?.status ?? "")) return "clinician_review";
  return "decision";
}

function changedFields(
  previous: BlueprintRecommendationSnapshot,
  current: BlueprintRecommendationSnapshot,
): BlueprintRecommendationDelta["changedFields"] {
  const fields: BlueprintRecommendationDelta["changedFields"] = [];
  if (comparisonValue(previous.name) !== comparisonValue(current.name)) fields.push("name");
  if (comparisonValue(previous.status) !== comparisonValue(current.status)) fields.push("status");
  if (comparisonValue(previous.dose) !== comparisonValue(current.dose)) fields.push("dose");
  if (comparisonValue(previous.timing) !== comparisonValue(current.timing)) fields.push("timing");
  if (comparisonValue(previous.rationale) !== comparisonValue(current.rationale)) fields.push("rationale");
  return fields;
}

function fieldList(fields: BlueprintRecommendationDelta["changedFields"]): string {
  const labels = fields.map((field) => {
    if (field === "dose") return "starting guidance";
    if (field === "timing") return "timing guidance";
    if (field === "rationale") return "report rationale";
    if (field === "status") return "review status";
    return "display name";
  });
  if (labels.length <= 1) return labels[0] ?? "report guidance";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function explanationFor(
  kind: BlueprintDeltaKind,
  previous: BlueprintRecommendationSnapshot | null,
  current: BlueprintRecommendationSnapshot | null,
  fields: BlueprintRecommendationDelta["changedFields"],
): string {
  if (kind === "added") {
    return current?.rationale
      ? `This option is new in the current report. The recorded rationale is: ${current.rationale}`
      : "This option is new in the current report. No additional rationale was recorded.";
  }
  if (kind === "removed") {
    return "This option is no longer listed as a recommendation. That is a report change, not an instruction to stop a medication, supplement, or hormone.";
  }
  if (kind === "changed") {
    return `The current report changed the ${fieldList(fields)}.${current?.rationale ? ` Current rationale: ${current.rationale}` : ""}`;
  }
  return "The recommendation and its recorded guidance are unchanged from the prior Blueprint.";
}

function actionFor(
  kind: BlueprintDeltaKind,
  attention: BlueprintDeltaAttention,
): Pick<BlueprintRecommendationDelta, "actionHref" | "actionLabel"> {
  if (kind === "removed") return { actionHref: "#version-history", actionLabel: "Open prior Blueprint" };
  if (kind === "unchanged") return { actionHref: "#recommendation-report", actionLabel: "Review report detail" };
  if (attention === "clinician_review") return { actionHref: "#recommendation-report", actionLabel: "Review before discussing" };
  return { actionHref: "#recommendation-decisions", actionLabel: "Make a decision" };
}

function safetyExplanation(previousStatus: BlueprintSafetyStatus, currentStatus: BlueprintSafetyStatus): string {
  if (currentStatus === "error") {
    return "The current report does not contain a readable safety section. Treat its safety status as unavailable until the report is reviewed.";
  }
  if (previousStatus !== currentStatus && currentStatus === "safe") {
    return "The current deterministic safety review no longer identifies a material concern in the report. Review the current notes before acting on any recommendation.";
  }
  if (previousStatus !== currentStatus) {
    return "The current deterministic safety review now contains notes that need attention. Open the safety section for the recorded findings.";
  }
  if (currentStatus === "warning") {
    return "The safety-review status is unchanged and the current report still contains notes that need attention.";
  }
  return "The deterministic safety-review status is unchanged, with no material concern identified in either report.";
}

export function buildBlueprintDelta(input: BuildBlueprintDeltaInput): BlueprintDelta {
  const previous = extractBlueprintRecommendationSnapshots(input.previousMarkdown);
  const current = extractBlueprintRecommendationSnapshots(input.currentMarkdown);
  const previousByKey = new Map(previous.map((item) => [item.key, item]));
  const currentByKey = new Map(current.map((item) => [item.key, item]));
  const keys = [...new Set([...currentByKey.keys(), ...previousByKey.keys()])];

  const recommendations = keys.map((key): BlueprintRecommendationDelta => {
    const previousItem = previousByKey.get(key) ?? null;
    const currentItem = currentByKey.get(key) ?? null;
    const fields = previousItem && currentItem ? changedFields(previousItem, currentItem) : [];
    const kind: BlueprintDeltaKind = !previousItem
      ? "added"
      : !currentItem
        ? "removed"
        : fields.length
          ? "changed"
          : "unchanged";
    const attention = attentionFor(kind, currentItem);
    return {
      key,
      name: currentItem?.name ?? previousItem?.name ?? "Recommendation",
      kind,
      attention,
      changedFields: fields,
      previous: previousItem,
      current: currentItem,
      explanation: explanationFor(kind, previousItem, currentItem, fields),
      ...actionFor(kind, attention),
    };
  }).sort((left, right) => {
    const order: Record<BlueprintDeltaKind, number> = { added: 0, changed: 1, removed: 2, unchanged: 3 };
    return order[left.kind] - order[right.kind] || left.name.localeCompare(right.name);
  });

  const previousStatus = deriveBlueprintSafetyStatus(input.previousMarkdown);
  const currentStatus = deriveBlueprintSafetyStatus(input.currentMarkdown);

  return {
    previousStackId: input.previousStackId,
    previousCreatedAt: input.previousCreatedAt,
    currentCreatedAt: input.currentCreatedAt,
    generationReason: input.generationReason,
    recommendations,
    counts: recommendations.reduce<Record<BlueprintDeltaKind, number>>(
      (counts, item) => ({ ...counts, [item.kind]: counts[item.kind] + 1 }),
      { added: 0, changed: 0, removed: 0, unchanged: 0 },
    ),
    safety: {
      previousStatus,
      currentStatus,
      changed: previousStatus !== currentStatus,
      needsReview: currentStatus !== "safe",
      explanation: safetyExplanation(previousStatus, currentStatus),
    },
  };
}
