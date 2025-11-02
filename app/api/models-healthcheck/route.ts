/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { askMini, askMain, getResolvedModels } from "@/lib/models";

// Tiny prompt that returns a literal token; keeps usage minimal
const PING = "reply exactly with: ok";

export const dynamic = "force-dynamic";

export async function GET() {
  const resolved = getResolvedModels();

  async function tryGroup(kind: "mini" | "main") {
    try {
      const { res, used } = kind === "mini"
        ? await askMini(PING, { maxTokens: 32, timeoutMs: 10_000 })
        : await askMain(PING, { maxTokens: 32, timeoutMs: 10_000 });

      const ok = (res.text || "").trim().toLowerCase().includes("ok");

      return {
        model: kind === "mini" ? resolved.MINI : resolved.MAIN,
        ok,
        used,
        prompt_tokens: res.usage?.prompt_tokens ?? null,
        completion_tokens: res.usage?.completion_tokens ?? null,
        error: null,
        sample: res.text?.slice(0, 40) ?? "",
      };
    } catch (e: any) {
      return {
        model: kind === "mini" ? resolved.MINI : resolved.MAIN,
        ok: false,
        used: null,
        prompt_tokens: null,
        completion_tokens: null,
        error: String(e?.message || e),
      };
    }
  }

  const mini = await tryGroup("mini");
  const main = await tryGroup("main");

  return NextResponse.json({
    ok: Boolean(mini.ok && main.ok),
    mini,
    main,
    resolved,
    key_present: Boolean(process.env.OPENAI_API_KEY),
  });
}
