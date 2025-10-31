/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/openai";

function envModel(name: string, fallback: string) {
  const v = process.env[name];
  return (v && v.trim()) || fallback;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const main = url.searchParams.get("main") || envModel("OPENAI_MAIN_MODEL", "gpt-4o");
  const mini = url.searchParams.get("mini") || envModel("OPENAI_MINI_MODEL", "gpt-4o-mini");

  const res = { ok: false, mini: {} as any, main: {} as any, resolved: { MINI: mini, MAIN: main }, key_present: !!process.env.OPENAI_API_KEY, project: null as any };

  async function tryModel(model: string) {
    try {
      const r = await callLLM("Reply exactly with: ok", model, { maxTokens: 32, timeoutMs: 10_000 });
      const text = (r?.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
      const ok = text === "ok";
      return {
        model,
        ok,
        used: r?.model ?? null,
        prompt_tokens: r?.usage?.prompt_tokens ?? null,
        completion_tokens: r?.usage?.completion_tokens ?? null,
        error: null as string | null,
      };
    } catch (e: any) {
      return { model, ok: false, used: null, prompt_tokens: null, completion_tokens: null, error: String(e?.message || e) };
    }
  }

  res.mini = await tryModel(mini);
  res.main = await tryModel(main);
  res.ok = !!(res.mini?.ok && res.main?.ok);

  return NextResponse.json(res, { status: 200 });
}
