/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callOpenAI, type NormalizedLLMResponse } from "@/lib/openai";

const DEFAULTS = {
  MINI: process.env.OPENAI_MODEL_MINI || "gpt-4o-2024-08-06", // safe mini-ish default
  MAIN: process.env.OPENAI_MODEL_MAIN || "gpt-5",             // try 5, fallback logic is in UI
};

type ProbeResult = {
  model: string;
  ok: boolean;
  used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error: string | null;
  sample?: string;
};

async function probe(model: string, text: string, maxTokens = 32): Promise<ProbeResult> {
  try {
    const res: NormalizedLLMResponse = await callOpenAI(model, text, { maxTokens, timeoutMs: 10_000 });
    const out = (res.text || "").trim();
    const ok = out.toLowerCase().includes("ok");
    return {
      model,
      ok,
      used: res.model || model,
      prompt_tokens: res.usage?.prompt_tokens ?? null,
      completion_tokens: res.usage?.completion_tokens ?? null,
      error: null,
      sample: out.slice(0, 200),
    };
  } catch (e: any) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: String(e?.message || e),
    };
  }
}

export async function GET() {
  const MINI = DEFAULTS.MINI;
  const MAIN = DEFAULTS.MAIN;

  const keyPresent = !!process.env.OPENAI_API_KEY;

  // simple instruction that returns "ok" on success
  const prompt = "Reply with exactly: ok";

  const [miniRes, mainRes] = await Promise.all([
    probe(MINI, prompt, 32),
    probe(MAIN, prompt, 32),
  ]);

  const ok = !!(miniRes.ok || mainRes.ok);

  return NextResponse.json({
    ok,
    mini: miniRes,
    main: mainRes,
    resolved: { MINI, MAIN },
    key_present: keyPresent,
  });
}
