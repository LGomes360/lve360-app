// app/api/generate-report/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import OpenAI from "openai";

/**
 * POST /api/generate-report
 * Body: { submissionId: string }
 *
 * Behavior:
 *  - Validate submissionId
 *  - Load submission from Supabase
 *  - Call OpenAI Responses API to generate report
 *  - Save report row to `reports` with token usage and estimate
 */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = (body.submissionId ?? body.submission_id ?? "").toString().trim();
    if (!submissionId) return NextResponse.json({ error: "submissionId required" }, { status: 400 });

    // Fetch submission
    const { data: submission, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (subErr || !submission) {
      return NextResponse.json({ error: "submission not found" }, { status: 404 });
    }

    // Build a safe report prompt (you can customize)
    const prompt = `Generate LVE360 report for submission:\n\n${JSON.stringify(submission, null, 2)}`;

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: prompt,
    });

    // Defensive extraction of text + usage
    const outputText = (response as any).output_text ?? JSON.stringify(response);
    const usage = (response as any).usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Estimate cost (replace with your real per-1k constants if known)
    const INPUT_COST_PER_1K = parseFloat(process.env.INPUT_COST_PER_1K ?? "0");
    const OUTPUT_COST_PER_1K = parseFloat(process.env.OUTPUT_COST_PER_1K ?? "0");
    const estCost =
      (usage.prompt_tokens / 1000) * (INPUT_COST_PER_1K || 0) +
      (usage.completion_tokens / 1000) * (OUTPUT_COST_PER_1K || 0);

    // Save report row
    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("reports")
      .insert({
        submission_id: submissionId,
        body: outputText,
        total_tokens: usage.total_tokens,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        est_cost_usd: estCost ? estCost.toFixed(4) : null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveErr) {
      return NextResponse.json({ ok: true, saved: false, error: saveErr.message, raw: response }, { status: 200 });
    }

    return NextResponse.json({ ok: true, report_id: saved.id, raw: response }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
