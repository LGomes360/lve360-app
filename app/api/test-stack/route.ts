// app/api/test-stack/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Example endpoint to test stack generation.
 * Lazy-initializes OpenAI at request-time to avoid build-time instantiation.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = (body.submissionId ?? body.submission_id ?? "").toString().trim();
    if (!submissionId) return NextResponse.json({ error: "submissionId required" }, { status: 400 });

    // fetch submission (same as your other route)
    const { data: submission, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (subErr || !submission) {
      return NextResponse.json({ error: "submission not found" }, { status: 404 });
    }

    // ---------
    // Lazy init OpenAI client
    // ---------
    let openai: any = null;
    try {
      // Try local factory first if present
      const mod: any = await import("../../../src/lib/openai").catch(() => null);
      if (mod) {
        if (typeof mod.getOpenAiClient === "function") openai = mod.getOpenAiClient();
        else if (typeof mod.getOpenAI === "function") openai = mod.getOpenAI();
        else if (mod.default) {
          const Def = mod.default;
          openai = typeof Def === "function" ? new Def({ apiKey: process.env.OPENAI_API_KEY }) : Def;
        }
      }

      // Fallback: dynamic import of official SDK
      if (!openai) {
        const OpenAIMod: any = await import("openai");
        const OpenAIDef = OpenAIMod?.default ?? OpenAIMod;
        openai = typeof OpenAIDef === "function" ? new OpenAIDef({ apiKey: process.env.OPENAI_API_KEY }) : OpenAIDef;
      }

      if (!openai) throw new Error("OpenAI initialization failed");
    } catch (e: any) {
      console.error("OpenAI init failed:", e?.message ?? e);
      return NextResponse.json({ ok: false, error: "OpenAI unavailable (missing key or misconfigured)" }, { status: 500 });
    }

    // Example call — adapt to your test-stack logic
    const prompt = `Test generate stack for:\n\n${JSON.stringify(submission, null, 2)}`;
    let response: any;
    try {
      response = await openai.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        input: prompt,
      });
    } catch (apiErr: any) {
      console.error("OpenAI API error:", apiErr?.message ?? apiErr);
      return NextResponse.json({ ok: false, error: "OpenAI API error", details: String(apiErr?.message ?? apiErr) }, { status: 502 });
    }

    return NextResponse.json({ ok: true, raw: response }, { status: 200 });
  } catch (err: any) {
    console.error("[test-stack] fatal error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
