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
  return Boolean(
    blueprint
    && blueprint.safety_status === "error"
    && !blueprint.safety_acknowledged,
  );
}

export function deriveTodayBlueprintNotice(
  blueprint: CurrentBlueprintContext | null,
  experimentBlueprint: ExperimentBlueprintContext | null,
): TodayBlueprintNotice | null {
  if (!blueprint) return null;

  if (isUrgentBlueprintSafety(blueprint)) {
    return {
      tone: "urgent",
      title: "The current Blueprint safety review needs attention",
      detail: "LVE360 could not confirm the current safety section. Review the Blueprint before using health-sensitive guidance. Your lifestyle practice remains available below.",
      href: `/blueprints/${blueprint.stack_id}#safety-notes`,
      actionLabel: "Review safety section",
    };
  }

  const safetyWaiting = blueprint.safety_status === "warning" && !blueprint.safety_acknowledged;
  const sourceChanged = Boolean(experimentBlueprint?.needs_review);

  if (safetyWaiting) {
    const additionalContext = [
      blueprint.needs_refresh ? "Your saved health information also differs from this report." : null,
      sourceChanged ? "This weekly practice came from an earlier Blueprint." : null,
    ].filter(Boolean).join(" ");
    return {
      tone: "maintenance",
      title: "Review your current Blueprint safety notes",
      detail: `${additionalContext ? `${additionalContext} ` : ""}Your focused lifestyle action is unchanged.`,
      href: `/blueprints/${blueprint.stack_id}#safety-notes`,
      actionLabel: "Open Blueprint",
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
      detail: "Refresh the Blueprint when convenient. Today’s focused lifestyle action is unchanged.",
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
