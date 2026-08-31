import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { callOpenAI, type ChatMsg, type JsonSchemaResponseFormat, type NormalizedLLMResponse } from "@/lib/openai";
import { candidateModels, taskProfile, type AiTask } from "@/lib/ai/modelConfig";
import { estimatedCostUsd } from "@/lib/ai/modelPricing";

type GenerateAiOptions = {
  task: AiTask;
  messages: ChatMsg[] | string;
  userId?: string | null;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  responseFormat?: JsonSchemaResponseFormat;
};

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safetyIdentifier(userId?: string | null) {
  return userId ? stableHash({ namespace: "lve360-member", userId }) : undefined;
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
        responseFormat: options.responseFormat,
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
        estimated_cost_usd: estimatedCostUsd(modelUsed, response.usage),
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

