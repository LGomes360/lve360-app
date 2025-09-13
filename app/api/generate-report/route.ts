// -----------------------------------------------------------------------------
// LVE360 // generate-report
// Generates concierge report from submission, logs usage + cost,
// and records failures for visibility in Supabase.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Pricing constants (as of Sept 2025 GPT-4o)
const INPUT_COST_PER_1K = 0.005;
const OUTPUT_COST_PER_1K = 0.015;

export async function POST(req: NextRequest) {
  const supabase = getAdmin();

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return NextResponse.json(
        { error: "Missing submission_id" },
        { status: 400 }
      );
    }

    // Fetch submission from Supabase
    const { data: submission, error: fetchErr } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", submission_id)
      .single();

    if (fetchErr || !submission) {
      throw new Error(`Submission not found: ${fetchErr?.message}`);
    }

    // Call OpenAI GPT-4o
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are LVE360, generating a structured Concierge Health Report in markdown.",
        },
        {
          role: "user",
          content: JSON.stringify(submission),
        },
      ],
      max_tokens: 2000,
    });

    const report = response.choices[0]?.message?.content || "No report generated";

    // Token usage
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const estCost =
      (usage.prompt_tokens / 1000) * INPUT_COST_PER_1K +
      (usage.completion_tokens / 1000) * OUTPUT_COST_PER_1K;

    // Save report
    const { data: saved, error: saveErr } = await supabase
      .from("reports")
      .insert({
        submission_id,
        body: report,
        total_tokens: usage.total_tokens,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        est_cost_usd: estCost.toFixed(4),
      })
      .select()
      .single();

    if (saveErr) throw saveErr;

    return NextResponse.json({ report: saved }, { status: 200 });
  } catch (err: any) {
    console.error("Generate report failed:", err.message);

    // Log to webhook_failures
    const supabase = getAdmin();
    await supabase.from("webhook_failures").insert({
      source: "generate-report",
      error: err.message || "Unknown error",
      raw: JSON.stringify(err, Object.getOwnPropertyNames(err)),
    });

    return NextResponse.json(
      { error: "Failed to generate report", details: err.message },
      { status: 500 }
    );
  }
}
