/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { askAny, MINI_MODELS, MAIN_MODELS } from "@/lib/models";

export const dynamic = "force-dynamic";

async function probe(list: string[]) {
  // Try each model in the list, but report the first item’s status
  const model = list[0] || "unknown";
  try {
    const { res, used } = await askAny(list, "reply exactly with: ok", {
      maxTokens: 16,
      timeoutMs: 8000,
    });
    const txt = (res.text || "").trim().toLowerCase();
    return {
      model,
      ok: txt === "ok",
      used,
      prompt_tokens: res.promptTokens ?? null,
      completion_tokens: res.completionTokens ?? null,
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

export async function GET() {
  const key_present = Boolean(process.env.OPENAI_API_KEY);
  const project = process.env.OPENAI_PROJECT ?? null;

  const mini = await probe(MINI_MODELS);
  const main = await probe(MAIN_MODELS);

  return NextResponse.json({
    ok: Boolean(mini.ok || main.ok),
    mini,
    main,
    resolved: { MINI: MINI_MODELS[0], MAIN: MAIN_MODELS[0] },
    key_present,
    project,
  });
}
