// app/api/models-healthcheck/route.ts
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai"; // your existing wrapper (string prompt signature)

export const dynamic = "force-dynamic";

const MINI = process.env.OPENAI_MINI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAIN = process.env.OPENAI_MAIN_MODEL || process.env.OPENAI_MODEL || "gpt-4o";

type ProbeResult = {
  model: string;
  ok: boolean;
  used: string | null;
  text?: string | null;
  error?: string | null;
};

async function tryModel(model: string): Promise<ProbeResult> {
  try {
    // callLLM(model, prompt: string, { maxTokens, timeoutMs })
    const res = await callLLM(model, "reply exactly with: ok", { maxTokens: 4, timeoutMs: 8000 });
    const text = (res?.text ?? "").trim().toLowerCase();
    return {
      model,
      ok: text.includes("ok"),
      used: res?.modelUsed ?? model,
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
    },
    { status: ok ? 200 : 207 } // 207 = some checks failed but endpoint works
  );
}
