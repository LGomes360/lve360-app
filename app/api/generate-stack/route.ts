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
 * Returns JSON: { ok: true, saved: true/false, stack_id?, markdown?, error? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let submissionId = (body.submissionId ?? body.submission_id ?? "")?.toString().trim() || null;
    const tallyShort = (body.tally_submission_id ?? body.tallyId ?? body.tally ?? "")?.toString().trim() || null;

    // If a short Tally id is provided, resolve it to the submission UUID
    if (!submissionId && tallyShort) {
      const resolved = await supabaseAdmin
        .from("submissions")
        .select("id,user_email,user_id,tally_submission_id")
        .eq("tally_submission_id", tallyShort)
        .limit(1)
        .single()
        .catch((e: any) => ({ data: null, error: e }));

      if (!resolved?.data) {
        return NextResponse.json({ ok: false, saved: false, error: `Submission not found for tally_submission_id=${tallyShort}` }, { status: 404 });
      }
      submissionId = resolved.data.id;
    }

    if (!submissionId) {
      return NextResponse.json({ ok: false, saved: false, error: "submissionId required" }, { status: 400 });
    }

    // 1) Generate stack markdown using your helper (OpenAI)
    const { markdown, raw } = await generateStackForSubmission(submissionId);

    // 2) Fetch the submission to obtain user_email (stacks.user_email is NOT NULL)
    const submissionQuery = await supabaseAdmin
      .from("submissions")
      .select("id,user_email,user_id,tally_submission_id")
      .eq("id", submissionId)
      .limit(1)
      .single()
      .catch((e: any) => ({ data: null, error: e }));

    if (!submissionQuery?.data) {
      // We generated markdown, but we can't attach to a submission we can't find
      return NextResponse.json({ ok: true, saved: false, error: "Could not find submission to attach stack to", markdown }, { status: 200 });
    }

    const submissionRow = submissionQuery.data;
    const userEmail = submissionRow.user_email ?? null;

    if (!userEmail) {
      // Schema requires user_email on stacks; fail with a clear message
      return NextResponse.json({
        ok: true,
        saved: false,
        error: "Submission has no user_email (stacks.user_email is required)",
        markdown,
      }, { status: 200 });
    }

    // 3) Build payload and persist (use insert so we don't rely on unique constraints)
    const payload = {
      user_email: userEmail,
      submission_id: submissionId,
      version: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      body: markdown,
      items: JSON.stringify([]), // placeholder; populate later if you parse items
      tally_submission_id: submissionRow.tally_submission_id ?? null,
      user_id: submissionRow.user_id ?? null,
      created_at: new Date().toISOString(),
      raw: raw ? JSON.stringify(raw) : null,
    };

    const insertResp = await supabaseAdmin
      .from("stacks")
      .insert(payload)
      .select()
      .single()
      .catch((e: any) => ({ data: null, error: e }));

    if (!insertResp?.data) {
      return NextResponse.json({ ok: true, saved: false, error: String(insertResp?.error?.message ?? insertResp?.error ?? "Insert failed"), markdown }, { status: 200 });
    }

    const saved = insertResp.data;
    return NextResponse.json({ ok: true, saved: true, stack_id: saved.id, markdown }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
