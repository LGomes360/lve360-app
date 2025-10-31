/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

type Probe = {
  model: string;
  ok: boolean;
  used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error: string | null;
  raw_sample?: string | null;
};

function env(name: string, fallback?: string) {
  const v = process.env[name];
  return (v && v.trim()) || fallback || null;
}

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase().replace(/^["'`]+|["'`]+$/g, "");
}

async function probe(model: string): Promise<Probe> {
  try {
    // Use explicit instructions (system) + minimal input so Responses API outputs text
    const res = await callLLM(
      [
        { role: "system", content: "You are a health checker. Reply exactly with: ok" },
        { role: "user", content: "ok" },
      ],
      model,
      { maxTokens: 8, timeoutMs: 10_000 }
    );

    const content = res?.choices?.[0]?.message?.content ?? "";
    const text = norm(content);
    const ok = text === "ok" || text.startsWith("ok");

    return {
      model,
      ok,
      used: (res as any)?.model ?? model,
      prompt_tokens: res?.usage?.prompt_tokens ?? null,
      completion_tokens: res?.usage?.completion_tokens ?? null,
      error: null,
      raw_sample: String(content ?? "").slice(0, 80),
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
  const keyPresent = !!process.env.OPENAI_API_KEY;
  const MINI = env("OPENAI_MINI_MODEL", "gpt-5-mini")!;
  const MAIN = env("OPENAI_MAIN_MODEL", "gpt-5")!;

  const [mini, main] = await Promise.all([probe(MINI), probe(MAIN)]);
  const ok = keyPresent && mini.ok && main.ok;

  return NextResponse.json({
    ok,
    mini,
    main,
    resolved: { MINI, MAIN },
    key_present: keyPresent,
    project: env("OPENAI_PROJECT"),
  });
}
