// app/api/generate-stack/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";

/**
 * POST /api/generate-stack
 * Accepts body:
 *   - submissionId: UUID (preferred)
 *   - OR tally_submission_id: short Tally id (e.g. "jaJMeJQ")
 *
 * Returns JSON: { ok: true, saved: true/false, stack?, ai? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let submissionId = (body.submissionId ?? body.submission_id ?? "")?.toString().trim() || null;
    const tallyShort = (body.tally_submission_id ?? body.tallyId ?? body.tally ?? "")?.toString().trim() || null;

    // If caller provided only the short Tally id, resolve it to the submission UUID
    if (!submissionId && tallyShort) {
      try {
        // Await the query and handle the returned { data, error } shape
        const resp = await supabaseAdmin
          .from("submissions")
          .select("id,tally_submission_id,user_email")
          .eq("tally_submission_id", tallyShort)
          .limit(1);

        const { data, error } = resp as any;

        if (error) {
          console.error("Error resolving tally_submission_id:", error);
          return NextResponse.json(
            { ok: false, error: "Failed to resolve tally_submission_id", details: String(error?.message ?? error) },
            { status: 500 }
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          return NextResponse.json(
            { ok: false, error: `Submission not found for tally_submission_id=${tallyShort}` },
            { status: 404 }
          );
        }

        submissionId = data[0].id;
      } catch (err: any) {
        console.error("Unexpected error resolving tally id:", err);
        return NextResponse.json({ ok: false, error: "Failed to resolve tally_submission_id", details: String(err) }, { status: 500 });
      }
    }

    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "submissionId required (or provide tally_submission_id)" }, { status: 400 });
    }

    // Load submission row (optional; helps find user_email or tally id)
    let submissionRow: any = null;
    try {
      const { data: sdata, error: sErr } = await supabaseAdmin
        .from("submissions")
        .select("id,user_email,tally_submission_id")
        .eq("id", submissionId)
        .limit(1);

      if (!sErr && Array.isArray(sdata) && sdata.length) {
        submissionRow = sdata[0];
      }
    } catch (e) {
      // non-fatal: continue if this lookup fails
      console.warn("Ignored error loading submission:", e);
    }

    // 1) Generate stack via the OpenAI helper
    const { markdown, raw } = await generateStackForSubmission(submissionId);

    // 2) Determine user_email (submission row preferred; fallback to AI or placeholder)
    const userEmail = (submissionRow?.user_email ?? raw?.user_email ?? `unknown+${Date.now()}@local`)?.toString();

    // 3) Build stack payload (adjust fields to match your schema as needed)
    const stackRow: any = {
      submission_id: submissionId,
      user_email: userEmail,
      email: userEmail,
      version: process.env.OPENAI_MODEL ?? null,
      summary: typeof markdown === "string" ? markdown.slice(0, 2000) : null,
      items: [],
      sections: { markdown: markdown ?? null, raw: raw ?? null, generated_at: new Date().toISOString() },
      notes: null,
      total_monthly_cost: 0,
      tally_submission_id: submissionRow?.tally_submission_id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 4) Upsert into stacks (use onConflict to avoid duplicate rows)
    const { data: savedArr, error: saveErr } = await supabaseAdmin
      .from("stacks")
      .upsert(stackRow, { onConflict: "submission_id" })
      .select();

    if (saveErr) {
      console.error("Failed to persist stack:", saveErr);
      return NextResponse.json({ ok: true, saved: false, error: String(saveErr.message ?? saveErr), ai: { markdown, raw } }, { status: 200 });
    }

    const saved = Array.isArray(savedArr) ? savedArr[0] ?? null : savedArr;

    return NextResponse.json({ ok: true, saved: true, stack: saved, ai: { markdown, raw } }, { status: 200 });
  } catch (err: any) {
    console.error("Unhandled error in generate-stack:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
