type AiCostRow = {
  task: string;
  estimated_cost_usd: number | string | null;
};

type CostTotal = {
  generations: number;
  estimatedCostUsd: number;
  unknownCostGenerations: number;
};

export type FounderAiCosts = {
  estimatedCostUsd: number | null;
  unknownCostGenerations: number;
  topTasks: Array<{
    task: string;
    generations: number;
    estimatedCostUsd: number | null;
    unknownCostGenerations: number;
  }>;
};

function costOrNull(value: AiCostRow["estimated_cost_usd"]): number | null {
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function knownSubtotal(total: CostTotal): number | null {
  // No activity is zero; activity with no usable costs is unavailable.
  return total.generations > 0 && total.unknownCostGenerations === total.generations
    ? null
    : total.estimatedCostUsd;
}

export function summarizeFounderAiCosts(rows: readonly AiCostRow[]): FounderAiCosts {
  const total: CostTotal = { generations: 0, estimatedCostUsd: 0, unknownCostGenerations: 0 };
  const tasks = new Map<string, CostTotal>();
  for (const row of rows) {
    const task = tasks.get(row.task) ?? { generations: 0, estimatedCostUsd: 0, unknownCostGenerations: 0 };
    const cost = costOrNull(row.estimated_cost_usd);
    total.generations += 1;
    task.generations += 1;
    if (cost === null) {
      total.unknownCostGenerations += 1;
      task.unknownCostGenerations += 1;
    } else {
      total.estimatedCostUsd += cost;
      task.estimatedCostUsd += cost;
    }
    tasks.set(row.task, task);
  }

  return {
    estimatedCostUsd: knownSubtotal(total),
    unknownCostGenerations: total.unknownCostGenerations,
    topTasks: [...tasks.entries()]
      .map(([task, values]) => ({ task, ...values, estimatedCostUsd: knownSubtotal(values) }))
      .sort((left, right) => (right.estimatedCostUsd ?? 0) - (left.estimatedCostUsd ?? 0) || right.generations - left.generations)
      .slice(0, 5),
  };
}
