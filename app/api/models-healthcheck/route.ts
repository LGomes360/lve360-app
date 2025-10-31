/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

type Probe = {
  model: string;
  ok: boolean;
  used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error?: string | null;
};

async function tryModel(model: string): Promise<Probe> {
  try {
    // Ask for a tiny reply. Wrapper will set safe defaults for GPT-5.
    const res = await callLLM("Reply exactly with: ok", model, { maxTokens: 64, timeoutMs: 8000 });

    const content = res?.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    const ok = content.includes("ok");
    const used = (res as any)?.model ?? model;
    const u = res?.usage;
    return {
      model,
      ok,
      used: used || null,
      prompt_tokens: u?.prompt_tokens ?? null,
      completion_tokens: u?.completion_tokens ?? null,
      error: null,
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const MINI = url.searchParams.get("mini") || process.env.OPENAI_MINI_MODEL || "gpt-4o-mini";
  const MAIN = url.searchParams.get("main") || process.env.OPENAI_MAIN_MODEL || "gpt-4o";

  const key_present = Boolean(process.env.OPENAI_API_KEY);

  const [mini, main] = await Promise.all([tryModel(MINI), tryModel(MAIN)]);

  return NextResponse.json({
    ok: key_present && mini.ok && main.ok,
    mini,
    main,
    resolved: { MINI, MAIN },
    key_present,
    project: process.env.VERCEL_PROJECT_ID || null,
  });
}
