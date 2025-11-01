/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

const MINI = process.env.OPENAI_MINI_MODEL?.trim() || "gpt-4o-mini";
const MAIN = process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4o";

// Tiny prompt that must return "ok"
const PROMPT = "Reply exactly with: ok";

async function probe(model: string) {
  try {
    const res = await callLLM(
      model,
      [{ role: "user", content: PROMPT }],
      { maxTokens: 32, timeoutMs: 8_000 }
    );
    const txt = (res.text || "").trim().toLowerCase();
    return {
      model,
      ok: txt === "ok",
      used: res.modelUsed ?? null,
      prompt_tokens: res.promptTokens ?? null,
      completion_tokens: res.completionTokens ?? null,
      error: null as string | null,
      raw_sample: txt || "",
    };
  } catch (e: any) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: String(e?.message || e),
      raw_sample: "",
    };
  }
}

export async function GET() {
  const key_present = Boolean(process.env.OPENAI_API_KEY);
  const [mini, main] = await Promise.all([probe(MINI), probe(MAIN)]);

  return NextResponse.json({
    ok: Boolean(mini.ok || main.ok),
    mini,
    main,
    resolved: { MINI, MAIN },
    key_present,
    project: process.env.OPENAI_PROJECT || null,
  });
}
// --- Compatibility aliases for older imports ---
export type LLMResult = NormalizedLLMResponse;
export const callOpenAI = callLLM;
