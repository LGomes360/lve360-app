/* eslint-disable no-console */
// app/api/models-healthcheck/route.ts
// Minimal model healthcheck that works with both Chat Completions (e.g. gpt-4o)
// and Responses API models routed via our callLLM wrapper.

import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai"; // ✅ import only; DO NOT re-export

export const dynamic = "force-dynamic"; // always run on server
export const runtime = "nodejs";        // (optional) avoid edge for SDK sockets

type PingResult = {
  model: string;
  ok: boolean;
  used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error: string | null;
  raw_sample?: string;
};

function resolveModels() {
  // Allow environment overrides; keep sensible defaults
  const MINI =
    process.env.OPENAI_MODEL_MINI ||
    process.env.NEXT_PUBLIC_OPENAI_MODEL_MINI ||
    process.env.OPENAI_MODEL ||
    "gpt-4o";

  const MAIN =
    process.env.OPENAI_MODEL_MAIN ||
    process.env.NEXT_PUBLIC_OPENAI_MODEL_MAIN ||
    "gpt-4o";

  return { MINI, MAIN };
}

async function pingModel(model: string, maxTokens = 16): Promise<PingResult> {
  try {
    // callLLM accepts (messages|string, model, opts)
    const res = await callLLM("reply exactly with: ok", model, {
      maxTokens: Math.max(16, maxTokens), // gpt-5* requires >=16
      timeoutMs: 8000,
    });

    const content = (res?.choices?.[0]?.message?.content ?? "").trim();
    const ok = content.toLowerCase().includes("ok");

    return {
      model,
      ok,
      used: (res as any)?.model ?? model,
      prompt_tokens: res?.usage?.prompt_tokens ?? null,
      completion_tokens: res?.usage?.completion_tokens ?? null,
      error: null,
      raw_sample: content,
    };
  } catch (err: any) {
    const msg =
      typeof err?.message === "string"
        ? err.message
        : String(err ?? "unknown error");
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: msg,
    };
  }
}

export async function GET() {
  const keyPresent = Boolean(process.env.OPENAI_API_KEY);
  const resolved = resolveModels();

  const mini = await pingModel(resolved.MINI);
  const main = await pingModel(resolved.MAIN);

  const ok = mini.ok || main.ok;

  return NextResponse.json({
    ok,
    mini,
    main,
    resolved,
    key_present: keyPresent,
    // If you are using projects, you can include it for extra context
    project: process.env.OPENAI_PROJECT ?? null,
  });
}
