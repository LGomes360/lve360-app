/* eslint-disable no-console */
import { callOpenAI } from "@/lib/openai";

function parseList(v: string | undefined, def: string[]): string[] {
  if (!v) return def;
  const s = v.trim();
  if (!s) return def;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

type AskAnyOpts = { maxTokens?: number; temperature?: number; timeoutMs?: number };

export async function askAny(
  models: string[],
  messagesOrString: any,
  opts?: AskAnyOpts
): Promise<{ res: { text: string; modelUsed?: string }; used: string }> {
  let lastErr: any = null;

  for (const m of models) {
    try {
      const res = await callOpenAI(m, messagesOrString, opts);
      const text = (res.text || "").trim();
      if (!text) throw new Error(`[askAny] model ${m} returned empty text`);
      return { res: { text, modelUsed: res.modelUsed }, used: res.modelUsed || m };
    } catch (e) {
      lastErr = e;
      console.warn(`[askAny] model ${m} failed`, e);
    }
  }
  throw lastErr || new Error("All models failed");
}

export function resolvedModels() {
  // Primary (5* families)
  const MAIN = process.env.OPENAI_MODEL_MAIN || "gpt-5";
  const MINI = process.env.OPENAI_MODEL_MINI || "gpt-5-mini";

  // Fallbacks (4o families)
  const FALLBACK_MAIN = process.env.OPENAI_MODEL_FALLBACK_MAIN || "gpt-4o";
  const FALLBACK_MINI = process.env.OPENAI_MODEL_FALLBACK_MINI || "gpt-4o-mini";

  // Optional overrides via public envs (comma-separated)
  const overrideMain = parseList(process.env.NEXT_PUBLIC_OVERRIDE_MAIN, [MAIN, FALLBACK_MAIN]);
  const overrideMini = parseList(process.env.NEXT_PUBLIC_OVERRIDE_MINI, [MINI, FALLBACK_MINI]);

  return {
    MAIN,
    MINI,
    FALLBACK_MAIN,
    FALLBACK_MINI,
    overrideMain,
    overrideMini,
  };
}
