import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { callOpenAI, type ChatMsg, type NormalizedLLMResponse } from "@/lib/openai";
import { candidateModels, taskProfile, type AiTask } from "@/lib/ai/modelConfig";

type GenerateAiOptions = {
  task: AiTask;
  messages: ChatMsg[] | string;
  userId?: string | null;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
};

type ModelPrice = {
  input: number;
  cachedInput: number;
  output: number;
};

// USD per one million tokens. Update centrally when OpenAI pricing changes.
// Effective 2026-08-10. Unknown model versions intentionally return no estimate.
const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-5.6-terra": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.6-luna": { input: 1, cachedInput: 0.1, output: 6 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safetyIdentifier(userId?: string | null) {
  return userId ? stableHash({ namespace: "lve360-member", userId }) : undefined;
}

function modelPrice(model: string) {
  const exact = MODEL_PRICES[model];
  if (exact) return exact;
  const alias = Object.keys(MODEL_PRICES).find((name) => model.startsWith(`${name}-`));
  return alias ? MODEL_PRICES[alias] : undefined;
}

function estimatedCostUsd(model: string, response?: NormalizedLLMResponse) {
  const price = modelPrice(model);
  const usage = response?.usage;
  if (!price || !usage) return null;

  const input = Math.max(0, Number(usage.prompt_tokens ?? 0));
  const cached = Math.min(input, Math.max(0, Number(usage.cached_tokens ?? 0)));
  const uncached = Math.max(0, input - cached);
  const output = Math.max(0, Number(usage.completion_tokens ?? 0));
  return ((uncached * price.input) + (cached * price.cachedInput) + (output * price.output)) / 1_000_000;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { code?: unknown; status?: unknown; name?: unknown };
  return String(candidate.code ?? candidate.status ?? candidate.name ?? "unknown_error").slice(0, 120);
}

async function recordGeneration(row: Record<string, unknown>) {
  try {
    const { error } = await getSupabaseAdmin().from("ai_generation_ledger").insert(row);
    if (error) console.warn("[ai.gateway] usage ledger write failed", error.message);
  } catch (error) {
    // Generation must remain available during migration rollout or a transient ledger outage.
    console.warn("[ai.gateway] usage ledger unavailable", error);
  }
}

export async function generateAI(options: GenerateAiOptions): Promise<NormalizedLLMResponse> {
  const profile = taskProfile(options.task);
  const models = candidateModels(profile.capability);
  const requestedModel = models[0];
  const contextHash = stableHash({
    task: options.task,
    promptVersion: profile.promptVersion,
    messages: options.messages,
  });
  const startedAt = Date.now();
  let lastError: unknown = null;

  for (const [index, model] of models.entries()) {
    try {
      const response = await callOpenAI(model, options.messages, {
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
        temperature: options.temperature,
        reasoningEffort: profile.reasoningEffort,
        safetyIdentifier: safetyIdentifier(options.userId),
      });
      const modelUsed = response.modelUsed || response.model || model;
      const usage = response.usage;

      await recordGeneration({
        user_id: options.userId ?? null,
        task: options.task,
        capability: profile.capability,
        prompt_version: profile.promptVersion,
        context_hash: contextHash,
        requested_model: requestedModel,
        model_used: modelUsed,
        fallback_used: index > 0,
        status: "succeeded",
        prompt_tokens: usage?.prompt_tokens ?? null,
        cached_input_tokens: usage?.cached_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        reasoning_tokens: usage?.reasoning_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        latency_ms: Date.now() - startedAt,
        estimated_cost_usd: estimatedCostUsd(modelUsed, response),
      });

      return response;
    } catch (error) {
      lastError = error;
      console.warn(`[ai.gateway] ${options.task} failed with ${model}`, error);
    }
  }

  await recordGeneration({
    user_id: options.userId ?? null,
    task: options.task,
    capability: profile.capability,
    prompt_version: profile.promptVersion,
    context_hash: contextHash,
    requested_model: requestedModel,
    model_used: models.at(-1) ?? requestedModel,
    fallback_used: models.length > 1,
    status: "failed",
    latency_ms: Date.now() - startedAt,
    error_code: errorCode(lastError),
  });

  throw lastError || new Error(`No model is configured for ${options.task}`);
}

