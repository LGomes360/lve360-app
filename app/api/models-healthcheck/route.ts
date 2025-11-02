// app/api/models-healthcheck/route.ts
/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callOpenAI, type ChatMsg } from "@/lib/openai";

// Helper: run a model and decide if it's "healthy"
async function pingModel(model: string) {
  const msgs: ChatMsg[] = [
    { role: "system", content: "You are a health-check probe. Reply with exactly: ok" },
    { role: "user", content: "ping" },
  ];

  try {
    const res = await callOpenAI(model, msgs, { maxTokens: 32, timeoutMs: 12_000 });

    // Unified sample text
    const sample = (res.text ?? "").trim();

    // For GPT-5 family (Responses API), accept ANY non-empty text as healthy.
    // The API sometimes returns resource IDs (e.g., rs_...) or summarized blocks.
    const isGpt5 = model.toLowerCase().startsWith("gpt-5");
    const ok =
      isGpt5
        ? sample.length > 0 // non-empty means model responded
        : sample.toLowerCase() === "ok"; // for Chat Completions, require exact "ok"

    return {
      model,
      ok,
      used: res.modelUsed ?? res.model,
      prompt_tokens: res.usage?.prompt_tokens ?? null,
      completion_tokens: res.usage?.completion_tokens ?? null,
      error: null as string | null,
      sample,
    };
  } catch (e: any) {
    return {
      model,
      ok: false,
      used: null as string | null,
      prompt_tokens: null as number | null,
      completion_tokens: null as number | null,
      error: String(e?.message ?? e),
      sample: "",
    };
  }
}

export async function GET() {
  const MINI = process.env.OPENAI_MODEL_MINI ?? "gpt-5-mini";
  const MAIN = process.env.OPENAI_MODEL_MAIN ?? "gpt-5";
  const FALLBACK_MINI = process.env.OPENAI_FALLBACK_MINI ?? "gpt-4o-mini";
  const FALLBACK_MAIN = process.env.OPENAI_FALLBACK_MAIN ?? "gpt-4o";

  const key_present = !!process.env.OPENAI_API_KEY;

  const [mini, main, fbMini, fbMain] = await Promise.all([
    pingModel(MINI),
    pingModel(MAIN),
    pingModel(FALLBACK_MINI),
    pingModel(FALLBACK_MAIN),
  ]);

  const ok = (mini.ok || fbMini.ok) && (main.ok || fbMain.ok);

  return NextResponse.json({
    ok,
    mini,
    main,
    fallbackMini: fbMini,
    fallbackMain: fbMain,
    resolved: { MAIN, MINI, FALLBACK_MAIN, FALLBACK_MINI },
    key_present,
  });
}
