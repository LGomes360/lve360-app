import type { WeeklyExperiment } from "./activation";
import type { ExperimentBlueprintContext } from "./blueprintContext";

export type PracticeGoalRow = {
  id: string;
  goals: unknown;
  custom_goal: string | null;
  target_weight: number | string | null;
  target_sleep: number | string | null;
  target_energy: number | string | null;
};

export type PracticeGoalOption = {
  key: string;
  label: string;
  kind: "named" | "weight_target" | "sleep_target" | "energy_target";
};

export type PracticeConnectionContext = {
  type: WeeklyExperiment["connection_type"];
  goal: {
    key: string | null;
    label: string | null;
    status: "current" | "historical" | "unresolved";
  } | null;
  blueprint: {
    label: string | null;
    status: "current" | "historical" | "unresolved";
  } | null;
  summary: string;
};

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/\s+/g, " ").trim().slice(0, 160) || null;
}

function readableValues(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    return String(value).split(/[,;|\n]/).map(cleanLabel).filter((item): item is string => Boolean(item));
  }
  if (Array.isArray(value)) return [...new Set(value.flatMap(readableValues))];
  if (typeof value === "object") return [...new Set(Object.values(value as Record<string, unknown>).flatMap(readableValues))];
  return [];
}

function goalKey(label: string): string {
  const normalized = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  return `named:${normalized || "goal"}`;
}

function numberOrNull(value: number | string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function practiceGoalOptions(row: PracticeGoalRow | null): PracticeGoalOption[] {
  if (!row) return [];
  const result: PracticeGoalOption[] = [];
  const seen = new Set<string>();
  for (const label of [...readableValues(row.goals), ...readableValues(row.custom_goal)]) {
    const key = goalKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ key, label, kind: "named" });
  }
  const weight = numberOrNull(row.target_weight);
  const sleep = numberOrNull(row.target_sleep);
  const energy = numberOrNull(row.target_energy);
  if (weight != null) result.push({ key: "target:weight", label: "Reach target weight", kind: "weight_target" });
  if (sleep != null) result.push({ key: "target:sleep", label: "Reach target sleep", kind: "sleep_target" });
  if (energy != null) result.push({ key: "target:energy", label: "Reach target energy", kind: "energy_target" });
  return result;
}

export function connectionType(hasGoal: boolean, hasBlueprint: boolean): WeeklyExperiment["connection_type"] {
  if (hasGoal && hasBlueprint) return "both";
  if (hasGoal) return "goal";
  if (hasBlueprint) return "blueprint";
  return "independent";
}

export function resolvePracticeConnection(
  experiment: Pick<WeeklyExperiment, "connection_type" | "goal_key" | "goal_label_snapshot" | "source_stack_id" | "source_action_id">,
  goals: PracticeGoalOption[],
  blueprint: ExperimentBlueprintContext | null,
): PracticeConnectionContext {
  const hasStoredGoal = experiment.connection_type === "goal" || experiment.connection_type === "both";
  const currentGoal = hasStoredGoal && experiment.goal_key
    ? goals.find((option) => option.key === experiment.goal_key) ?? null
    : null;
  const goal = hasStoredGoal ? {
    key: experiment.goal_key,
    label: currentGoal?.label ?? experiment.goal_label_snapshot,
    status: currentGoal ? "current" as const : experiment.goal_label_snapshot ? "historical" as const : "unresolved" as const,
  } : null;
  const hasStoredBlueprint = experiment.connection_type === "blueprint" || experiment.connection_type === "both";
  const blueprintLink = hasStoredBlueprint ? {
    label: blueprint?.priority_label ?? null,
    status: blueprint?.priority_label
      ? blueprint.is_current_blueprint ? "current" as const : "historical" as const
      : "unresolved" as const,
  } : null;

  const reasons = [
    goal?.label ? `Supports saved goal: ${goal.label}` : goal ? "Saved goal link needs review" : null,
    blueprintLink?.label ? `Supports Blueprint priority: ${blueprintLink.label}` : blueprintLink ? "Blueprint priority link needs review" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    type: experiment.connection_type,
    goal,
    blueprint: blueprintLink,
    summary: reasons.length ? reasons.join(" · ") : "Independently chosen for this week",
  };
}
