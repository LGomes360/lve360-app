// app/api/models-healthcheck/route.ts
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

export const dynamic = "force-dynamic";

const MINI = process.env.OPENAI_MINI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAIN = process.env.OPENAI_MAIN_MODEL || process.env.OPENAI_MODEL || "gpt-4o";

// Be tolerant to whatever shape callLLM returns.
function extractText(res: any): string {
  return (
    res?.text ??
    res?.content ??
    res?.message?.content ??
    res?.choices?.[0]?.message?.content ??
    res?.choices?.[0]?.text ??
    ""
  );
}

type ProbeResult = {
  model: string;
  ok: boolean;
  used: string | null;
  text?: string | null;
  error?: string | null;
};

async function tryModel(model: string): Promise<ProbeResult> {
  try {
    // callLLM(model, prompt: string, options)
    const res: any = await callLLM(model, "reply exactly with: ok", {
      maxTokens: 4,
      timeoutMs: 8000,
    });

    const text = extractText(res).trim().toLowerCase();
    return {
      model,
      ok: text.includes("ok"),
      used: (res && (res.modelUsed || res.model)) ?? model,
      text,
    };
  } catch (e: any) {
    return {
      model,
      ok: false,
      used: null,
      error: String(e?.message ?? e),
    };
  }
}

export async function GET() {
  const [mini, main] = await Promise.all([tryModel(MINI), tryModel(MAIN)]);
  const ok = mini.ok && main.ok;

  return NextResponse.json(
    {
      ok,
      mini,
      main,
      resolved: { MINI, MAIN },
    },
    { status: ok ? 200 : 207 }
  );
}
