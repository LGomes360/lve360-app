/* eslint-disable no-console */
import { callOpenAI } from "@/lib/openai";
import type { NormalizedLLMResponse } from "@/lib/openai";


function parseList(v: string | undefined, def: string[]): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length
    ? (v as string).split(",").map((s) => s.trim()).filter(Boolean)
    : def;
}

// Defaults implement your intent:
// MINI: 5-mini ➜ 4o-mini ➜ 4o
// MAIN: 5 ➜ 4o
export const MINI_MODELS = parseList(
  process.env.OPENAI_PREFS_MINI,
  ["gpt-5-mini", "gpt-4o-mini", "gpt-4o"]
);

export const MAIN_MODELS = parseList(
  process.env.OPENAI_PREFS_MAIN,
  ["gpt-5", "gpt-4o"]
);

// Try models in order; return first success
export async function askAny(
  models: string[],
  messagesOrString: any,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<{ res: NormalizedLLMResponse; used: string }> {
  let lastErr: any = null;
  for (const m of models) {
    try {
      const res = await callOpenAI(m, messagesOrString, opts);
      return { res, used: res.modelUsed || m };
    } catch (e) {
      lastErr = e;
      console.warn(`[askAny] model ${m} failed`, e);
    }
  }
  throw lastErr ?? new Error("All model attempts failed");
}
