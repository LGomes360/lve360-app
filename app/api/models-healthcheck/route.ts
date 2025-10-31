/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM, type ChatMessage } from "@/lib/openai";

export const dynamic = "force-dynamic";

const MODELS = {
  MINI: process.env.OPENAI_MODEL_MINI || process.env.OPENAI_MODEL || "gpt-5-mini",
  MAIN: process.env.OPENAI_MODEL_MAIN || "gpt-5",
};

async function probe(model: string) {
  try {
    const msgs: ChatMessage[] = [
      { role: "system", content: "Reply exactly with: ok" },
      { role: "user", content: "ok" },
    ];

    // GPT-5 requires max_output_tokens >= 16; the wrapper auto-clamps,
    // but we’ll request 32 here to be explicit.
    const res = await callLLM(model, msgs, { maxTokens: 32, timeoutMs: 10_000 });

    const text = (res.text || "").trim().toLowerCase();
    const ok = text.includes("ok");

    return {
      model,
      ok,
      used: res.modelUsed ?? null,
      prompt_tokens: res.promptTokens ?? null,
      completion_tokens: res.completionTokens ?? null,
      error: null,
      raw_sample: text.slice(0, 120),
    };
  } catch (err: any) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: String(err?.message ?? err),
    };
  }
}

export async function GET() {
  const key_present = Boolean(process.env.OPENAI_API_KEY);
  const mini = await probe(MODELS.MINI);
  const main = await probe(MODELS.MAIN);

  const out = {
    ok: Boolean(mini.ok || main.ok),
    mini,
    main,
    resolved: MODELS,
    key_present,
    project: process.env.OPENAI_PROJECT || null,
  };

  return NextResponse.json(out, { status: out.ok ? 200 : 502 });
}
