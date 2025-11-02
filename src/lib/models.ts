/* eslint-disable no-console */
// Model resolution + simple fallbacks
// Never use dated version strings here. Let OpenAI route them.

import { callOpenAI, type NormalizedLLMResponse } from "@/lib/openai";

function env(name: string, def?: string) {
  const v = process.env[name];
  return (v && v.trim()) || def || "";
}

// Primary envs you already have in Vercel:
const MAIN   = env("OPENAI_MAIN_MODEL", "gpt-5");      // best-effort main
const MINI   = env("OPENAI_MINI_MODEL", "gpt-5-mini"); // best-effort mini

// New explicit fallbacks you added:
const FB_MAIN = env("OPENAI_FALLBACK_MAIN_MODEL", "gpt-4o");
const FB_MINI = env("OPENAI_FALLBACK_MINI_MODEL", "gpt-4o-mini");

// For healthchecks/askAny etc.
export function getResolvedModels() {
  return {
    MAIN,
    MINI,
    FALLBACK_MAIN: FB_MAIN,
    FALLBACK_MINI: FB_MINI,
  };
}

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
  throw lastErr ?? new Error("All models failed");
}

// Convenience helpers
export async function askMini(messagesOrString: any, opts?: { maxTokens?: number; timeoutMs?: number }) {
  return askAny([MINI, FB_MINI], messagesOrString, opts);
}
export async function askMain(messagesOrString: any, opts?: { maxTokens?: number; timeoutMs?: number }) {
  return askAny([MAIN, FB_MAIN], messagesOrString, opts);
}
