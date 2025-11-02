/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { askAny, resolvedModels } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const keyPresent = !!process.env.OPENAI_API_KEY;
  const { MAIN, MINI, FALLBACK_MAIN, FALLBACK_MINI } = resolvedModels();

  async function probe(model: string) {
    try {
      const { res, used } = await askAny(
        [model], // single model per probe (we want the true signal)
        // message: keep it dead simple; gpt-5 needs >=16 max_output_tokens
        [{ role: "user", content: "Reply exactly with: ok" }],
        { maxTokens: 32, timeoutMs: 12_000 }
      );
      const sample = (res.text || "").trim().slice(0, 100);
      return {
        model,
        ok: sample.toLowerCase() === "ok",
        used,
        prompt_tokens: res.usage?.prompt_tokens ?? null,
        completion_tokens: res.usage?.completion_tokens ?? null,
        error: null,
        sample,
      };
    } catch (e: any) {
      return { model, ok: false, used: null, prompt_tokens: null, completion_tokens: null, error: String(e?.message || e) };
    }
  }

  const mini = await probe(MINI);
  const main = await probe(MAIN);
  const fallbackMini = await probe(FALLBACK_MINI);
  const fallbackMain = await probe(FALLBACK_MAIN);

  const ok = [mini, main, fallbackMini, fallbackMain].some(x => x.ok);

  return NextResponse.json({
    ok,
    mini,
    main,
    fallbackMini,
    fallbackMain,
    resolved: { MAIN, MINI, FALLBACK_MAIN, FALLBACK_MINI },
    key_present: keyPresent,
  });
}
