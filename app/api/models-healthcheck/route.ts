/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

const MINI = process.env.OPENAI_MINI_MODEL || "gpt-4o-mini";
const MAIN = process.env.OPENAI_MAIN_MODEL || "gpt-4o";

async function tryModel(model: string) {
  try {
    // NOTE: Responses API needs >= 16 tokens
    const res = await callLLM(model, "reply exactly with: ok", { maxTokens: 32, timeoutMs: 8000 });
    const text = (res.text || "").trim().toLowerCase();
    return {
      model,
      ok: text === "ok",
      used: res.modelUsed ?? res.model ?? null,
      prompt_tokens: res.promptTokens ?? null,
      completion_tokens: res.completionTokens ?? null,
      error: null as string | null,
    };
  } catch (err: any) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: String(err?.message || err),
    };
  }
}

export async function GET() {
  const mini = await tryModel(MINI);
  const main = await tryModel(MAIN);
  const ok = mini.ok && main.ok;

  return NextResponse.json({
    ok,
    mini,
    main,
    resolved: { MINI, MAIN },
    key_present: Boolean(process.env.OPENAI_API_KEY),
    project: process.env.OPENAI_PROJECT || null,
  });
}
