/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

type ProbeResult = {
  model: string;
  ok: boolean;
  used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error: string | null;
  raw_sample?: string | null; // tiny peek for debugging
};

function readEnv(name: string, fallback?: string) {
  const v = process.env[name];
  return (v && v.trim()) || fallback || null;
}

function normalizeText(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  // strip surrounding quotes/backticks just in case
  return s.replace(/^["'`]+|["'`]+$/g, "").trim();
}

async function probe(model: string): Promise<ProbeResult> {
  try {
    // Very explicit instruction so the model replies *only* with ok
    const msgs = [
      { role: "system", content: "You are a health checker. Reply exactly with: ok" },
      { role: "user", content: "ok" },
    ] as const;

    const res = await callLLM(msgs as any, model, { maxTokens: 8, temperature: 0, timeoutMs: 10_000 });

    // Our callLLM normalizes to { choices[0].message.content }
    const content = res?.choices?.[0]?.message?.content ?? "";
    const text = normalizeText(content);

    const ok =
      text === "ok" ||
      text.startsWith("ok") || // tolerate trailing newline
      text.includes("ok");     // tolerate quotes or fence

    // try to capture a tiny sample for debugging
    const rawSample = String(content ?? "").slice(0, 64);

    return {
      model,
      ok,
      used: (res as any)?.model ?? model,
      prompt_tokens: res?.usage?.prompt_tokens ?? null,
      completion_tokens: res?.usage?.completion_tokens ?? null,
      error: null,
      raw_sample: rawSample,
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
  const MINI = readEnv("OPENAI_MINI_MODEL", "gpt-5-mini")!;
  const MAIN = readEnv("OPENAI_MAIN_MODEL", "gpt-5")!;

  const [mini, main] = await Promise.all([probe(MINI), probe(MAIN)]);
  const ok = keyPresent && mini.ok && main.ok;

  return NextResponse.json({
    ok,
    mini,
    main,
    resolved: { MINI, MAIN },
    key_present: keyPresent,
    project: readEnv("OPENAI_PROJECT"), // optional; shows up if you set it
  });
}
