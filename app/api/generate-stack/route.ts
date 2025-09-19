// app/api/generate-stack/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";
import { parseMarkdownToItems } from "@/lib/parseMarkdownToItems";

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
        // Be explicit about "any" here so TS doesn't infer the wrong Response type
        const resp: any = await supabaseAdmin
          .from("submissions")
          .select("id,tally_submission_id,user_email")
          .eq("tally_submission_id", tallyShort)
          .limit(1);

        const data: any = resp?.data;
        const error: any = resp?.error;

        if (error) {
          console.error("Error resolving tally_submission_id:", error);
          return NextResponse.json(
            { ok: false, error: "Failed to resolve tally_submission_id", details: String(error?.message ?? error) },
            { status: 500 }
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          return NextResponse.json({ ok: false, error: `Submission not found for tally_submission_id=${tallyShort}` }, { status: 404 });
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
    let submissionRow: Record<string, any> | null = null;
    try {
      const resp: any = await supabaseAdmin
        .from("submissions")
        .select("id,user_id,user_email,tally_submission_id,summary")
        .eq("id", submissionId)
        .limit(1);

      if (!resp?.error && Array.isArray(resp?.data) && resp.data.length) {
        submissionRow = resp.data[0];
      }
    } catch (e) {
      // non-fatal: continue if this lookup fails
      console.warn("Ignored error loading submission:", e);
    }

    // 1) Generate stack via the OpenAI helper
    // generateStackForSubmission may return 'raw' of unknown shape — treat as any
    const { markdown, raw }: { markdown: string | null; raw: any } = (await generateStackForSubmission(submissionId)) as any;

    // 2) Determine user_email (submission row preferred; fallback to AI or placeholder)
const userEmail = (submissionRow?.user_email ?? (raw as any)?.user_email ?? `unknown+${Date.now()}@local`).toString();

// 2b) Resolve user_id: prefer submissionRow.user_id; if missing, try lookup by email in users table.
// This helps link stacks to actual users when possible.
let userId: string | null = submissionRow?.user_id ?? null;
if (!userId && userEmail) {
  try {
    const uResp: any = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .limit(1);

    if (!uResp?.error && Array.isArray(uResp?.data) && uResp.data.length) {
      userId = uResp.data[0].id;
    }
  } catch (e) {
    console.warn('Non-fatal: user lookup by email failed', e);
    // continue without userId — we will still save the stack
  }
}

    // === New: pick best markdown candidate and parse into items ===
    // Try: sections/raw.output_text -> ai.markdown/raw.output_text -> returned markdown -> submission summary
    const markdownForParsing =
      (raw && (raw?.sections?.raw?.output_text || raw?.sections?.raw?.text?.content)) ||
      (raw && (raw?.markdown || (raw?.raw && raw.raw.output_text))) ||
      markdown ||
      (submissionRow && submissionRow.summary) ||
      "";

    const items = parseMarkdownToItems(String(markdownForParsing || ""));

    // 3) Build stack payload (adjust fields to match your schema as needed)
    const stackRow: any = {
      submission_id: submissionId,
      user_id: userId,
      user_email: userEmail,
      email: userEmail,
      version: process.env.OPENAI_MODEL ?? null,
      // store a shorter summary for quick views, but persist full markdown in sections.markdown
      summary: typeof markdownForParsing === "string" ? String(markdownForParsing).slice(0, 2000) : null,
      items, // populated by parseMarkdownToItems
      sections: { markdown: markdownForParsing ?? null, raw: raw ?? null, generated_at: new Date().toISOString() },
      notes: null,
      total_monthly_cost: 0,
      tally_submission_id: submissionRow?.tally_submission_id ?? (tallyShort ?? null),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 4) Upsert into stacks (use onConflict to avoid duplicate rows)
    const respSave: any = await supabaseAdmin
      .from("stacks")
      .upsert(stackRow, { onConflict: "submission_id" })
      .select();

    if (respSave?.error) {
      console.error("Failed to persist stack:", respSave.error);
      return NextResponse.json({ ok: true, saved: false, error: String(respSave.error?.message ?? respSave.error), ai: { markdown, raw } }, { status: 200 });
    }

    const saved = Array.isArray(respSave?.data) ? respSave.data[0] ?? null : respSave?.data ?? null;

    return NextResponse.json({ ok: true, saved: true, stack: saved, ai: { markdown, raw } }, { status: 200 });
  } catch (err: any) {
    console.error("Unhandled error in generate-stack:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
