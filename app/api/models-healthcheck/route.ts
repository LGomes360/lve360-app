/* eslint-disable no-console */
// app/api/models-healthcheck/route.ts
// Minimal model healthcheck using our callLLM wrapper.
// Avoid strict typings from the wrapper and safely extract text.

import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai"; // import only; do NOT re-export

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---- helpers ---------------------------------------------------------------

function extractText(res: any): string {
  // Try common shapes from both Chat Completions and Responses API normalizers
  const fromChoices = res?.choices?.[0]?.message?.content;
  const fromOutputText = res?.output_text; // some Responses API helpers
  const fromText = res?.text;              // fallback if wrapper sets .text

  const raw =
    (typeof fromChoices === "string" && fromChoices) ||
    (typeof fromOutputText === "string" && fromOutputText) ||
    (typeof fromText === "string" && fromText) ||
    "";

  return String(raw).trim();
}

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
  // Allow env overrides; keep sensible defaults
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
    const res: any = await callLLM("reply exactly with: ok", model, {
      maxTokens: Math.max(16, maxTokens), // gpt-5* requires >=16
      timeoutMs: 8000,
    });

    const content = extractText(res);
    const ok = content.toLowerCase().includes("ok");

    return {
      model,
      ok,
      used: (res && (res.model as string)) || model,
      prompt_tokens: res?.usage?.prompt_tokens ?? null,
      completion_tokens: res?.usage?.completion_tokens ?? null,
      error: null,
      raw_sample: content,
    };
  } catch (err: any) {
    const msg =
      typeof err?.message === "string" ? err.message : String(err ?? "unknown error");
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

// ---- route ----------------------------------------------------------------

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
    project: process.env.OPENAI_PROJECT ?? null,
  });
}
