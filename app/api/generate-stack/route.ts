// lve360-app/app/api/generate-stack
// -----------------------------------------------------------------------------
// POST /api/generate-stack
// Accepts body:
//   - submission_id: UUID
//   - OR tally_submission_id: short Tally id
//
// Generates a concierge report using LLM, applies safety checks + affiliate
// links, saves to Supabase, and returns Markdown + enriched stack items.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { ReportSchema, type Report } from "@/lib/reportSchema";
import { buildPrompt } from "@/lib/buildPrompt";
import { applySafetyChecks } from "@/lib/safetyCheck";
import { enrichAffiliateLinks } from "@/lib/affiliateLinks";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function findSubmissionRow(ids: {
  submission_id?: string;
  tally_submission_id?: string;
}) {
  let submission: any = null;

  if (ids.submission_id) {
    const { data } = await supa
      .from("submissions")
      .select("*")
      .eq("id", ids.submission_id)
      .maybeSingle();
    submission = data;
  }

  if (!submission && ids.tally_submission_id) {
    const tryFetch = async (val: string) => {
      const { data } = await supa
        .from("submissions")
        .select("*")
        .eq("tally_submission_id", val)
        .maybeSingle();
      return data;
    };
    submission = await tryFetch(ids.tally_submission_id);

    if (!submission) {
      const swapped = ids.tally_submission_id.endsWith("o")
        ? ids.tally_submission_id.replace(/o$/, "0")
        : ids.tally_submission_id.replace(/0$/, "o");
      submission = await tryFetch(swapped);
      if (submission) {
        console.warn(
          `[generate-report] corrected o/0 tail: ${ids.tally_submission_id} → ${swapped}`
        );
      }
    }
  }

  return submission;
}

function sectionsToMarkdown(sections: any[]): string {
  if (!sections || sections.length === 0) {
    return "## Report Generation Issue\n\nWe could not generate a personalized report. Please try again later.";
  }
  return sections
    .filter((s) => s && s.title && Array.isArray(s.content))
    .map((s) => `## ${s.title}\n\n${s.content.join("\n\n")}`)
    .join("\n\n---\n\n");
}

// -----------------------------------------------------------------------------
// Request schema
// -----------------------------------------------------------------------------

const ReqSchema = z.object({
  submission_id: z.string().uuid().optional(),
  tally_submission_id: z.string().min(3).optional(),
});

// -----------------------------------------------------------------------------
// POST handler
// -----------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { submission_id, tally_submission_id } = ReqSchema.parse(body);

    if (!submission_id && !tally_submission_id) {
      return NextResponse.json(
        { ok: false, error: "Missing submission identifier" },
        { status: 400 }
      );
    }

    const base = await findSubmissionRow({ submission_id, tally_submission_id });
    if (!base) {
      return NextResponse.json(
        { ok: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    // Fetch related tables
    const { data: supps } = await supa
      .from("submission_supplements")
      .select("*")
      .eq("submission_id", base.id);
    const { data: meds } = await supa
      .from("submission_medications")
      .select("*")
      .eq("submission_id", base.id);
    const { data: hormones } = await supa
      .from("submission_hormones")
      .select("*")
      .eq("submission_id", base.id);
    const { data: rules } = await supa.from("rules").select("*");
    const { data: interactions } = await supa.from("interactions").select("*");
    const { data: catalog } = await supa.from("supplements").select("*");

    // Build LLM prompt
    const prompt = buildPrompt({
      submission: base,
      supplements: supps ?? [],
      medications: meds ?? [],
      hormones: hormones ?? [],
      rules: rules ?? [],
      interactions: interactions ?? [],
      catalog: catalog ?? [],
    });

    // Call OpenAI
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const llm = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: JSON.stringify(prompt.user) },
      ],
      response_format: { type: "json_object" },
    });

    const rawText = llm.choices[0]?.message?.content ?? "{}";
    console.log("[LLM Raw Output]", rawText);

    // Parse response with schema
    let parsed: Report;
    try {
      parsed = ReportSchema.parse(JSON.parse(rawText));
    } catch (err) {
      console.error("[ReportSchema Validation Error]", err);
      parsed = { sections: [], stack_items: [] } as Report;
    }

    // ✅ Apply safety checks + affiliate links
    let finalItems = await applySafetyChecks(parsed.stack_items ?? [], {
      medications: meds ?? [],
      conditions: base.conditions ?? [],
      allergies: base.allergies ?? [],
    });
    finalItems = await enrichAffiliateLinks(finalItems);

    // Convert sections to markdown
    const markdown = sectionsToMarkdown(parsed.sections as any);

    // Save report
    const usage = llm.usage ?? {};
    const { error: reportErr } = await supa.from("reports").insert({
      submission_id: base.id,
      user_id: base.user_id ?? null,
      body: markdown,
      generated_by: "llm",
      total_tokens: usage.total_tokens ?? null,
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      est_cost_usd: (usage.total_tokens ?? 0) * 0.00001, // rough estimate
    });
    if (reportErr) console.error("[Reports Insert Error]", reportErr);

    // Save stack + items
    try {
      const { data: stackRows, error: stackErr } = await supa
        .from("stacks")
        .insert({
          user_email: base.user_email || "",
          submission_id: base.id,
          user_id: base.user_id ?? null,
          items: finalItems,
          sections: parsed.sections ?? [],
          summary: "LLM-generated supplement stack",
        })
        .select("id")
        .limit(1);

      if (stackErr) console.error("[Stacks Insert Error]", stackErr);

      const stackId = stackRows?.[0]?.id;
      if (stackId && finalItems.length > 0) {
        const itemsToInsert = finalItems.map((item: any) => ({
          stack_id: stackId,
          user_id: base.user_id ?? null,
          name: item.name,
          brand: item.brand ?? null,
          dose: item.dose,
          timing: item.timing,
          rationale: item.rationale,
          caution: item.cautions ?? null,
          citations: item.citations ?? [],
          link: item.link ?? null,
        }));
        const { error: itemErr } = await supa
          .from("stacks_items")
          .insert(itemsToInsert);
        if (itemErr) console.error("[StackItems Insert Error]", itemErr);
      }
    } catch (err) {
      console.error("[Stacks/Items Save Error]", err);
    }

    return NextResponse.json({
      ok: true,
      submission_id: base.id,
      report_markdown: markdown,
      items: finalItems,
    });
  } catch (err: any) {
    console.error("[generate-report Fatal]", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
