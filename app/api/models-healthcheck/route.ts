/* eslint-disable no-console */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

type CallOpenAI = typeof import("@/lib/openai").callOpenAI;

async function pingModel(model: string, callOpenAI: CallOpenAI) {
  try {
    // Single-string input works for both families via our wrapper.
    const res = await callOpenAI(model, "Reply exactly: ok", {
      maxTokens: 256,
      timeoutMs: 10_000,
      reasoningEffort: "low",
    });
    const sample = (res.text || "").trim().toLowerCase();
    const ok = sample.includes("ok");
    return {
      model,
      ok,
      used: res.modelUsed ?? model,
      prompt_tokens: res.usage?.prompt_tokens ?? null,
      completion_tokens: res.usage?.completion_tokens ?? null,
      error: ok ? null : "[healthcheck] empty or mismatched text",
      sample: ok ? "ok" : res.text,
    };
  } catch (e: any) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: e?.message || String(e),
    };
  }
}

export async function GET() {
  const vercelEnvironment = process.env.VERCEL_ENV;
  const isProduction = vercelEnvironment === "production"
    || (!vercelEnvironment && process.env.NODE_ENV === "production");
  if (isProduction) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [{ callOpenAI }, { resolvedModels }] = await Promise.all([
    import("@/lib/openai"),
    import("@/lib/ai/modelConfig"),
  ]);
  const key_present = Boolean(process.env.OPENAI_API_KEY);
  const resolved = resolvedModels();

  // Try 5* first, then 4o fallbacks — but report each explicitly.
  const [mini, main, fallbackMini, fallbackMain] = await Promise.all([
    pingModel(resolved.MINI, callOpenAI),
    pingModel(resolved.MAIN, callOpenAI),
    pingModel(resolved.FALLBACK_MINI, callOpenAI),
    pingModel(resolved.FALLBACK_MAIN, callOpenAI),
  ]);

  const ok = (mini.ok || main.ok || fallbackMini.ok || fallbackMain.ok) && key_present;

  return NextResponse.json({
    ok,
    mini,
    main,
    fallbackMini,
    fallbackMain,
    resolved: {
      MAIN: resolved.MAIN,
      MINI: resolved.MINI,
      FALLBACK_MAIN: resolved.FALLBACK_MAIN,
      FALLBACK_MINI: resolved.FALLBACK_MINI,
    },
    key_present,
  });
}
