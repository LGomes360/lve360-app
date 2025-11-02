/* eslint-disable no-console */
import { callOpenAI, type NormalizedLLMResponse, type ChatMsg } from "@/lib/openai";

function parseList(v: string | undefined, def: string[]): string[] {
  return (v || "").split(",").map(s => s.trim()).filter(Boolean).length ? (v || "").split(",").map(s => s.trim()).filter(Boolean) : def;
}

const DEFAULT_MAIN = "gpt-5";
const DEFAULT_MINI = "gpt-5-mini";
const DEFAULT_FALLBACK_MAIN = "gpt-4o";
const DEFAULT_FALLBACK_MINI = "gpt-4o-mini";

export function resolvedModels() {
  // Pull from env if present, else defaults
  const MAIN = process.env.OPENAI_MODEL_MAIN || DEFAULT_MAIN;
  const MINI = process.env.OPENAI_MODEL_MINI || DEFAULT_MINI;
  const FALLBACK_MAIN = process.env.OPENAI_FALLBACK_MAIN || DEFAULT_FALLBACK_MAIN;
  const FALLBACK_MINI = process.env.OPENAI_FALLBACK_MINI || DEFAULT_FALLBACK_MINI;

  return { MAIN, MINI, FALLBACK_MAIN, FALLBACK_MINI };
}

// Try a list of models in order; return first success
export async function askAny(
  models: string[],
  messagesOrString: ChatMsg[] | string,
  opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<{ res: NormalizedLLMResponse; used: string }> {
  let lastErr: any = null;
  for (const m of models) {
    try {
      const res = await callOpenAI(m, messagesOrString, opts);
      // If no text came back, treat as failure so we can fall back
      const txt = (res.text || "").trim();
      if (!txt) throw new Error(`[askAny] model ${m} returned empty text`);
      return { res, used: res.modelUsed || res.model || m };
    } catch (e) {
      lastErr = e;
      console.warn(`[askAny] model ${m} failed`, e);
    }
  }
  throw lastErr ?? new Error("askAny: all models failed");
}
