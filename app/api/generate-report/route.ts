// app/api/generate-report/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assertEnv } from "@/lib/env";

/**
 * POST /api/generate-report
 * Body: { submissionId: string }
 *
 * Lazily initializes OpenAI at request-time in a type-safe way so build-time
 * doesn't require OPENAI_API_KEY. Works with either:
 *  - src/lib/openai.ts exporting getOpenAiClient()
 *  - src/lib/openai.ts exporting getOpenAI()
 *  - or falling back to dynamic import('openai') and new OpenAI({ apiKey })
 */

export async function POST(req: NextRequest) {
  try {
    // Parse body safely
    const body = await req.json().catch(() => ({}));
    const submissionId = (body.submissionId ?? body.submission_id ?? "").toString().trim();
    if (!submissionId) {
      return NextResponse.json({ error: "submissionId required" }, { status: 400 });
    }

    // Fetch submission
    const { data: submission, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (subErr || !submission) {
      return NextResponse.json({ error: "submission not found" }, { status: 404 });
    }

    // Assert envs at request-time (throws in production if required envs missing)
    try {
      assertEnv();
    } catch (e) {
      console.error("env assertion failed:", e);
      return NextResponse.json({ error: "Server environment misconfigured" }, { status: 500 });
    }

    // -----------------------
    // Lazy-initialize OpenAI
    // -----------------------
    let openai: any = null;
    try {
      // Try your local factory first (if present)
      const mod: any = await import("@/lib/openai").catch(() => null);

      if (mod) {
        // Prefer the factory function if it exists
        if (typeof mod.getOpenAiClient === "function") {
          openai = mod.getOpenAiClient();
        } else if (typeof mod.getOpenAI === "function") {
          openai = mod.getOpenAI();
        } else if (mod.default) {
          // If default export is a class/constructor: instantiate it.
          // If default is already a client instance, accept it.
          const Def = mod.default;
          if (typeof Def === "function") {
            openai = new Def({ apiKey: process.env.OPENAI_API_KEY });
          } else {
            openai = Def;
          }
        }
      }

      // Fallback: dynamic import of the official SDK
      if (!openai) {
        const OpenAIMod: any = await import("openai");
        const OpenAIDef = OpenAIMod?.default ?? OpenAIMod;
        if (typeof OpenAIDef === "function") {
          openai = new OpenAIDef({ apiKey: process.env.OPENAI_API_KEY });
        } else {
          // defensive: assign whatever was exported
          openai = OpenAIDef;
        }
      }

      if (!openai) throw new Error("OpenAI initialization failed");
    } catch (e: any) {
      console.error("OpenAI init failed:", e?.message ?? e);
      return NextResponse.json({ ok: false, error: "OpenAI unavailable (missing key or misconfigured)" }, { status: 500 });
    }

    // Build a safe report prompt (customize as needed)
    const prompt = `Generate LVE360 report for submission:\n\n${JSON.stringify(submission, null, 2)}`;

    // Call OpenAI (Responses API) with defensive handling
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

    // Defensive extraction of text + usage (Responses API shapes vary)
    let outputText = "";
    try {
      if (typeof response === "string") {
        outputText = response;
      } else if (response.output_text) {
        outputText = response.output_text;
      } else if (Array.isArray(response.output) && response.output.length) {
        const first = response.output[0];
        if (typeof first === "string") {
          outputText = first;
        } else if (first?.content) {
          if (Array.isArray(first.content)) {
            outputText = first.content
              .map((c: any) => c.text ?? (Array.isArray(c.parts) ? c.parts.join("") : ""))
              .join("\n");
          } else if (typeof first.content === "string") {
            outputText = first.content;
          } else {
            outputText = JSON.stringify(first.content);
          }
        } else {
          outputText = JSON.stringify(first);
        }
      } else {
        outputText = JSON.stringify(response);
      }
    } catch (err) {
      console.error("Failed to extract output text:", err);
      outputText = JSON.stringify(response);
    }

    const usage = response?.usage ?? response?.metrics ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    const promptTokens = Number(usage.prompt_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? 0);

    // Compute total tokens in clear steps to avoid operator-mixing issues
    const totalTokensRaw = usage.total_tokens;
    const totalTokens = Number(totalTokensRaw != null ? totalTokensRaw : promptTokens + completionTokens);

    // Estimate cost (replace with your real per-1k constants if known)
    const INPUT_COST_PER_1K = parseFloat(process.env.INPUT_COST_PER_1K ?? "0") || 0;
    const OUTPUT_COST_PER_1K = parseFloat(process.env.OUTPUT_COST_PER_1K ?? "0") || 0;
    const estCost = (promptTokens / 1000) * INPUT_COST_PER_1K + (completionTokens / 1000) * OUTPUT_COST_PER_1K;

    // Save report row
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("reports")
      .insert({
        submission_id: submissionId,
        body: outputText,
        total_tokens: totalTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        est_cost_usd: estCost ? Number(estCost.toFixed(4)) : null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Failed to save report:", saveErr);
      return NextResponse.json({ ok: true, saved: false, error: saveErr.message, raw: response }, { status: 200 });
    }

    return NextResponse.json({ ok: true, report_id: saved.id, raw: response }, { status: 200 });
  } catch (err: any) {
    console.error("[generate-report] fatal error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
