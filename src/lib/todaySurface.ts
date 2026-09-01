import type { CurrentBlueprintContext, ExperimentBlueprintContext } from "./blueprintContext.ts";

export type TodayBlueprintNotice = {
  tone: "maintenance" | "urgent";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

/**
 * An ordinary stale Blueprint is maintenance, not an emergency. Today only
 * treats a missing or unreadable safety section as an urgent interruption.
 */
export function isUrgentBlueprintSafety(blueprint: CurrentBlueprintContext | null): boolean {
  return Boolean(blueprint?.safety.status === "unavailable" && blueprint.safety.needsAttention);
}

export function deriveTodayBlueprintNotice(
  blueprint: CurrentBlueprintContext | null,
  experimentBlueprint: ExperimentBlueprintContext | null,
): TodayBlueprintNotice | null {
  if (!blueprint) return null;

  if (isUrgentBlueprintSafety(blueprint)) {
    return {
      tone: "urgent",
      title: blueprint.safety.label,
      detail: `${blueprint.safety.detail} Your lifestyle practice remains available below.`,
      href: blueprint.safety.href,
      actionLabel: blueprint.safety.actionLabel,
    };
  }

  const sourceChanged = Boolean(experimentBlueprint?.needs_review);

  if (blueprint.safety.needsAttention) {
    const practiceContext = sourceChanged ? " This weekly practice came from an earlier Blueprint, but your focused lifestyle action remains unchanged." : " Your focused lifestyle action remains unchanged.";
    return {
      tone: "maintenance",
      title: blueprint.safety.label,
      detail: `${blueprint.safety.detail}${practiceContext}`,
      href: blueprint.safety.href,
      actionLabel: blueprint.safety.actionLabel,
    };
  }

  if (blueprint.needs_refresh && sourceChanged) {
    return {
      tone: "maintenance",
      title: "Your Blueprint has updates to review",
      detail: "Your saved health information changed, and this weekly practice came from an earlier Blueprint. Refresh when convenient. Your focused action is unchanged.",
      href: `/blueprints/${blueprint.stack_id}`,
      actionLabel: "Review updates",
    };
  }

  if (blueprint.needs_refresh) {
    return {
      tone: "maintenance",
      title: "Your saved changes are ready for Blueprint review",
      detail: "Your saved information differs from this dated report. This is not a new safety alert. Refresh the Blueprint when convenient. Today’s focused lifestyle action is unchanged.",
      href: `/blueprints/${blueprint.stack_id}`,
      actionLabel: "Review changes",
    };
  }

  if (sourceChanged) {
    return {
      tone: "maintenance",
      title: "This practice came from an earlier Blueprint",
      detail: "Review the current priorities when convenient. Your active practice has not been overwritten.",
      href: `/blueprints/${blueprint.stack_id}`,
      actionLabel: "Compare priorities",
    };
  }

  return null;
}
