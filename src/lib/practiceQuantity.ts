export const MAX_PRACTICE_QUANTITY = 100_000;

export type PracticeQuantityFields = {
  target_quantity: number | null;
  quantity_unit: string | null;
  minimum_quantity: number | null;
  minimum_quantity_unit: string | null;
};

export type PracticeCompletionQuantity = {
  completion_date: string;
  completion_kind: "full" | "minimum";
  completed_quantity: number | null;
  quantity_unit: string | null;
};

export type WeeklyPracticeMetrics = {
  practice: string;
  target_quantity_per_session: number | null;
  quantity_unit: string | null;
  planned_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  known_total_quantity: number | null;
  total_quantity_unit: string | null;
  minimum_quantity: number | null;
  minimum_quantity_unit: string | null;
};

type QuantitySource = {
  target_quantity?: unknown;
  quantity_unit?: unknown;
  minimum_quantity?: unknown;
  minimum_quantity_unit?: unknown;
};

function cleanUnit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!cleaned || !/^[\p{L}\p{N}][\p{L}\p{N}\s./%()-]*$/u.test(cleaned)) return null;
  return cleaned;
}

function positiveQuantity(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_PRACTICE_QUANTITY) return undefined;
  if (Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-8) return undefined;
  return quantity;
}

export function normalizePracticeQuantityFields(
  value: QuantitySource,
): { ok: true; value: PracticeQuantityFields } | { ok: false } {
  const targetQuantity = positiveQuantity(value.target_quantity);
  const minimumQuantity = positiveQuantity(value.minimum_quantity);
  if (targetQuantity === undefined || minimumQuantity === undefined) return { ok: false };

  const quantityUnit = cleanUnit(value.quantity_unit);
  const suppliedTargetUnit = value.quantity_unit != null && value.quantity_unit !== "";
  if ((targetQuantity == null) !== !quantityUnit || (suppliedTargetUnit && !quantityUnit)) return { ok: false };

  const suppliedMinimumUnit = value.minimum_quantity_unit != null && value.minimum_quantity_unit !== "";
  const explicitMinimumUnit = cleanUnit(value.minimum_quantity_unit);
  if (suppliedMinimumUnit && !explicitMinimumUnit) return { ok: false };
  const minimumUnit = minimumQuantity == null ? null : explicitMinimumUnit ?? quantityUnit;
  if ((minimumQuantity == null) !== !minimumUnit || (minimumQuantity == null && explicitMinimumUnit)) return { ok: false };

  return {
    ok: true,
    value: {
      target_quantity: targetQuantity,
      quantity_unit: quantityUnit,
      minimum_quantity: minimumQuantity,
      minimum_quantity_unit: minimumUnit,
    },
  };
}

export function completionQuantityForKind(
  experiment: QuantitySource,
  kind: "full" | "minimum",
): { completed_quantity: number | null; quantity_unit: string | null } {
  const normalized = normalizePracticeQuantityFields(experiment);
  if (!normalized.ok) return { completed_quantity: null, quantity_unit: null };
  if (kind === "minimum") {
    return {
      completed_quantity: normalized.value.minimum_quantity,
      quantity_unit: normalized.value.minimum_quantity_unit,
    };
  }
  return {
    completed_quantity: normalized.value.target_quantity,
    quantity_unit: normalized.value.quantity_unit,
  };
}

export function buildWeeklyPracticeMetrics(input: {
  practice: string | null;
  targetQuantity: number | null;
  quantityUnit: string | null;
  minimumQuantity: number | null;
  minimumQuantityUnit: string | null;
  plannedSessions: number;
  completions: PracticeCompletionQuantity[];
}): WeeklyPracticeMetrics {
  const uniqueCompletions = [...new Map(input.completions.map((item) => [item.completion_date, item])).values()];
  const plannedSessions = Math.max(1, Math.round(input.plannedSessions));
  const completedSessions = uniqueCompletions.length;
  const quantityRows = uniqueCompletions.map((item) => ({
    quantity: positiveQuantity(item.completed_quantity),
    unit: cleanUnit(item.quantity_unit),
  }));
  const knownUnit = quantityRows[0]?.unit ?? null;
  const hasKnownVolume = quantityRows.length > 0
    && quantityRows.every((item) => typeof item.quantity === "number" && !!item.unit && item.unit.toLowerCase() === knownUnit?.toLowerCase());
  const knownTotalQuantity = hasKnownVolume
    ? quantityRows.reduce((sum, item) => sum + Number(item.quantity), 0)
    : null;

  return {
    practice: input.practice?.trim() || "Weekly practice",
    target_quantity_per_session: input.targetQuantity,
    quantity_unit: cleanUnit(input.quantityUnit),
    planned_sessions: plannedSessions,
    completed_sessions: completedSessions,
    completion_rate: completedSessions / plannedSessions,
    known_total_quantity: knownTotalQuantity,
    total_quantity_unit: knownTotalQuantity == null ? null : knownUnit,
    minimum_quantity: input.minimumQuantity,
    minimum_quantity_unit: cleanUnit(input.minimumQuantityUnit),
  };
}

export function formatPracticeQuantity(quantity: number, unit: string): string {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(quantity);
  return `${amount} ${unit}`;
}

export function isUsableMinimumVersionText(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().replace(/[.!?]+$/, "");
  return !/^(?:once|twice|three|four|five|six|\d+)\s+(?:time|times|days|repetitions?)$/i.test(normalized);
}

export function practiceCompletionSummary(metrics: WeeklyPracticeMetrics): string {
  const volume = metrics.known_total_quantity != null && metrics.total_quantity_unit
    ? `, totaling ${formatPracticeQuantity(metrics.known_total_quantity, metrics.total_quantity_unit)}`
    : "";
  return `You completed your weekly practice ${metrics.completed_sessions} of ${metrics.planned_sessions} planned times this week${volume}.`;
}
