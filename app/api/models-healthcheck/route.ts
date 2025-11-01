/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callOpenAI, type LLMResult, type ChatMsg } from "@/lib/openai";

export const dynamic = "force-dynamic";

async function probe(model: string) {
  try {
    const res = await callOpenAI(model, [{ role: "user", content: "reply ONLY with: ok" }], { maxTokens: 32 });
    const text = (res.text || "").toLowerCase();
    const ok = text.includes("ok");
    return {
      model,
      ok,
      used: res.modelUsed,
      prompt_tokens: res.promptTokens ?? null,
      completion_tokens: res.completionTokens ?? null,
      error: null,
      sample: res.text.slice(0, 80),
    };
  } catch (e: any) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: String(e?.error?.message ?? e?.message ?? e),
      sample: "",
    };
  }
}

export async function GET() {
  const MINI = process.env.OPENAI_MINI_MODEL || "gpt-4o";
  const MAIN = process.env.OPENAI_MAIN_MODEL || "gpt-5";
  const mini = await probe(MINI);
  const main = await probe(MAIN);

  const payload = {
    ok: mini.ok || main.ok,
    mini,
    main,
    resolved: { MINI, MAIN },
    key_present: !!process.env.OPENAI_API_KEY,
    project: process.env.OPENAI_PROJECT ?? null,
  };

  return NextResponse.json(payload, { status: payload.ok ? 200 : 500 });
}
