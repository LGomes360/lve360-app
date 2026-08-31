export type ModelUsage = {
  prompt_tokens?: number | null;
  cached_tokens?: number | null;
  completion_tokens?: number | null;
};

export type ModelPrice = {
  input: number;
  cachedInput: number;
  output: number;
};

// USD per one million tokens. Keep this table aligned with the provider pricing page.
// Verified 2026-08-30: https://openai.com/api/pricing/
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
});

export function modelPrice(model: string) {
  const exact = MODEL_PRICES[model];
  if (exact) return exact;

  // Longest first prevents a broad alias from capturing a more specific snapshot.
  const alias = Object.keys(MODEL_PRICES)
    .sort((left, right) => right.length - left.length)
    .find((name) => model.startsWith(`${name}-`));
  return alias ? MODEL_PRICES[alias] : undefined;
}

export function estimatedCostUsd(model: string, usage?: ModelUsage | null) {
  const price = modelPrice(model);
  if (!price || !usage) return null;

  const input = Math.max(0, Number(usage.prompt_tokens ?? 0));
  const cached = Math.min(input, Math.max(0, Number(usage.cached_tokens ?? 0)));
  const uncached = Math.max(0, input - cached);
  const output = Math.max(0, Number(usage.completion_tokens ?? 0));
  return ((uncached * price.input) + (cached * price.cachedInput) + (output * price.output)) / 1_000_000;
}
