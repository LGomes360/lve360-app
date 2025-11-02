/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callOpenAI, type ChatMsg } from "@/lib/openai";

export const dynamic = "force-dynamic";

type Probe = {
  model: string;
  ok: boolean;
  used?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  error?: string | null;
  sample?: string;
  // minimal debug for GPT-5
  rawPreview?: {
    output0?: string;          // JSON of first output block keys
    output0_types?: string[];  // types inside content[]
  };
};

async function askAny(model: string, prompt: string): Promise<{ res: any; used: string }> {
  const res = await callOpenAI(model, [
    { role: "system", content: "Reply exactly with: ok" },
    { role: "user", content: prompt },
  ] as ChatMsg[], { maxTokens: 64, timeoutMs: 8000 });
  const used = (res as any)?.modelUsed || model;
  return { res, used };
}

function summarize5Raw(res: any): { output0?: string; output0_types?: string[] } | undefined {
  const raw = (res && (res as any).__raw) || undefined;
  if (!raw) return undefined;
  const out = (raw as any).output;
  if (!Array.isArray(out) || out.length === 0) return undefined;

  const first = out[0];
  const keys = first && typeof first === "object" ? Object.keys(first).slice(0, 6) : [];

  let types: string[] = [];
  // prefer content[] if present
  if (Array.isArray(first?.content)) {
    types = first.content.map((c: any) => (typeof c?.type === "string" ? c.type : typeof c));
  } else if (first?.summary) {
    const s = first.summary;
    if (Array.isArray(s)) {
      types = s.map((c: any) => (typeof c?.type === "string" ? c.type : typeof c));
    } else if (typeof s === "object") {
      types = Object.keys(s);
    } else if (typeof s === "string") {
      types = ["string"];
    }
  }

  return {
    output0: JSON.stringify(keys),
    output0_types: types,
  };
}


function toProbe(model: string, pack: { res?: any; used?: string; err?: any }): Probe {
  if (pack.err) {
    return {
      model,
      ok: false,
      used: null,
      prompt_tokens: null,
      completion_tokens: null,
      error: String(pack.err?.message || pack.err),
    };
  }
  const res = pack.res;
  const text = (res?.text ?? "").trim();
  const ok = text.toLowerCase() === "ok" || text.includes("ok");
  const usage = res?.usage || {};
  const probe: Probe = {
    model,
    ok,
    used: (res as any)?.modelUsed ?? pack.used ?? model,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    error: ok ? null : (text ? null : `[askAny] model ${model} returned empty text`),
    sample: text || undefined,
  };
  if (model.startsWith("gpt-5")) {
    probe.rawPreview = summarize5Raw(res);
  }
  return probe;
}

export async function GET() {
  const MAIN = process.env.OPENAI_MODEL_MAIN || "gpt-5";
  const MINI = process.env.OPENAI_MODEL_MINI || "gpt-5-mini";
  const FALLBACK_MAIN = process.env.OPENAI_MODEL_FALLBACK_MAIN || "gpt-4o";
  const FALLBACK_MINI = process.env.OPENAI_MODEL_FALLBACK_MINI || "gpt-4o-mini";

  const result: any = { ok: true };

  // primary mini
  try {
    const { res, used } = await askAny(MINI, "ok");
    result.mini = toProbe(MINI, { res, used });
  } catch (err: any) {
    result.mini = toProbe(MINI, { err });
    result.ok = false;
  }

  // primary main
  try {
    const { res, used } = await askAny(MAIN, "ok");
    result.main = toProbe(MAIN, { res, used });
  } catch (err: any) {
    result.main = toProbe(MAIN, { err });
    result.ok = false;
  }

  // fallbacks (always probe so we can see they’re alive)
  try {
    const { res, used } = await askAny(FALLBACK_MINI, "ok");
    result.fallbackMini = toProbe(FALLBACK_MINI, { res, used });
  } catch (err: any) {
    result.fallbackMini = toProbe(FALLBACK_MINI, { err });
    result.ok = false;
  }

  try {
    const { res, used } = await askAny(FALLBACK_MAIN, "ok");
    result.fallbackMain = toProbe(FALLBACK_MAIN, { res, used });
  } catch (err: any) {
    result.fallbackMain = toProbe(FALLBACK_MAIN, { err });
    result.ok = false;
  }

  result.resolved = { MAIN, MINI, FALLBACK_MAIN, FALLBACK_MINI };
  result.key_present = !!process.env.OPENAI_API_KEY;

  return NextResponse.json(result, { status: 200 });
}
