/* eslint-disable no-console */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import OpenAI from "openai";

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
  let available_latest_models: string[] = [];
  let model_catalog_error: string | null = null;

  if (key_present) {
    try {
      const models = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).models.list();
      available_latest_models = models.data
        .map((model) => model.id)
        .filter((id) => /^gpt-5\.(4|5|6)(-|$)/.test(id))
        .sort();
    } catch (error) {
      model_catalog_error = error instanceof Error ? error.message : String(error);
    }
  }

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
    available_latest_models,
    model_catalog_error,
    key_present,
  });
}
