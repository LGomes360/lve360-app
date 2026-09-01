import type { BlueprintSafetyStatus } from "./blueprintSafetyStatus.ts";

export type CanonicalSafetyStatus =
  | "unavailable"
  | "refresh_required"
  | "clear"
  | "review_required"
  | "reviewed";

export type CanonicalSafetyState = {
  version: "canonical-safety-v1";
  status: CanonicalSafetyStatus;
  needsAttention: boolean;
  reportStatus: BlueprintSafetyStatus | null;
  sourceStackId: string | null;
  sourceCreatedAt: string | null;
  acknowledgementRecorded: boolean;
  acknowledgementEffective: boolean;
  acknowledgedAt: string | null;
  planChangedAt: string | null;
  planChangeSummary: string | null;
  href: string;
  label: string;
  detail: string;
  actionLabel: string;
};

export type CanonicalSafetyInput = {
  stackId: string | null;
  stackCreatedAt: string | null;
  reportStatus: BlueprintSafetyStatus | null;
  acknowledgedAt?: string | null;
  latestRegimenChange?: {
    createdAt: string;
    summary?: string | null;
  } | null;
};

export type RegimenPlanChangeState = {
  changeType: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
};

const SAFETY_RELEVANT_REGIMEN_FIELDS = ["item_kind", "name", "dose", "timing", "schedule", "active"] as const;

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function isSafetyRelevantRegimenChange(change: RegimenPlanChangeState): boolean {
  if (["added", "stopped", "resumed", "replaced"].includes(change.changeType)) return true;
  if (!change.beforeState || !change.afterState) return true;
  return SAFETY_RELEVANT_REGIMEN_FIELDS.some((field) => !sameValue(change.beforeState?.[field], change.afterState?.[field]));
}

export function deriveCanonicalSafetyState(input: CanonicalSafetyInput): CanonicalSafetyState {
  const href = input.stackId ? `/blueprints/${input.stackId}#safety-notes` : "/blueprints";
  const acknowledgementRecorded = Boolean(input.acknowledgedAt);
  const changedAfterReview = Boolean(
    input.stackCreatedAt
      && input.latestRegimenChange?.createdAt
      && new Date(input.latestRegimenChange.createdAt).getTime() > new Date(input.stackCreatedAt).getTime(),
  );
  const shared = {
    version: "canonical-safety-v1" as const,
    reportStatus: input.reportStatus,
    sourceStackId: input.stackId,
    sourceCreatedAt: input.stackCreatedAt,
    acknowledgementRecorded,
    acknowledgedAt: input.acknowledgedAt ?? null,
    planChangedAt: changedAfterReview ? input.latestRegimenChange?.createdAt ?? null : null,
    planChangeSummary: changedAfterReview ? input.latestRegimenChange?.summary ?? null : null,
    href,
  };

  if (!input.stackId || !input.stackCreatedAt || !input.reportStatus) {
    return {
      ...shared,
      status: "unavailable",
      needsAttention: true,
      acknowledgementEffective: false,
      label: "Safety review unavailable",
      detail: "Open your Blueprint to establish the safety context for your current plan.",
      actionLabel: "Open safety review",
    };
  }

  if (changedAfterReview) {
    return {
      ...shared,
      status: "refresh_required",
      needsAttention: true,
      acknowledgementEffective: false,
      label: "Safety review needed after plan changes",
      detail: "Your regimen changed after this review. Refresh the Blueprint before relying on it for current safety decisions.",
      actionLabel: "Refresh safety review",
    };
  }

  if (input.reportStatus === "error") {
    return {
      ...shared,
      status: "unavailable",
      needsAttention: true,
      acknowledgementEffective: false,
      label: "Safety review unavailable",
      detail: "LVE360 could not confirm the current safety section. Review the Blueprint before using health-sensitive guidance.",
      actionLabel: "Review safety section",
    };
  }

  if (input.reportStatus === "safe") {
    return {
      ...shared,
      status: "clear",
      needsAttention: false,
      acknowledgementEffective: false,
      label: "No material concern identified",
      detail: "The latest Blueprint did not identify a material concern from the information provided.",
      actionLabel: "Open safety review",
    };
  }

  if (acknowledgementRecorded) {
    return {
      ...shared,
      status: "reviewed",
      needsAttention: false,
      acknowledgementEffective: true,
      label: "Safety notes reviewed",
      detail: "You marked the current Blueprint safety notes as reviewed.",
      actionLabel: "Review safety notes again",
    };
  }

  return {
    ...shared,
    status: "review_required",
    needsAttention: true,
    acknowledgementEffective: false,
    label: "Safety notes need review",
    detail: "The latest Blueprint contains items to review with a clinician or healthcare provider.",
    actionLabel: "Review safety notes",
  };
}
