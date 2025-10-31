import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

async function tryModel(model: string) {
  try {
    const res = await callLLM(model, [
      { role: "user", content: "ping" }
    ], { maxTokens: 5, timeoutMs: 8000 });
    return { model, ok: true, used: res?.modelUsed ?? model };
  } catch (e: any) {
    return { model, ok: false, error: String(e?.message || e) };
  }
}

export async function GET() {
  const minis = [process.env.OPENAI_MINI_MODEL || "gpt-5-mini", "gpt-4o-mini"];
  const mains = [process.env.OPENAI_MAIN_MODEL || "gpt-5", "gpt-4o"];

  const checks = await Promise.all([...minis, ...mains].map(tryModel));
  return NextResponse.json({
    env: {
      OPENAI_MINI_MODEL: process.env.OPENAI_MINI_MODEL,
      OPENAI_MAIN_MODEL: process.env.OPENAI_MAIN_MODEL,
    },
    checks,
  });
}
