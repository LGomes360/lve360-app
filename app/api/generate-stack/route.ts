// app/api/generate-stack/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";

/**
 * POST /api/generate-stack
 * Body: { submissionId: string }
 *
 * Behavior:
 *  - Validate submissionId
 *  - Generate stack via generateStackForSubmission
 *  - Upsert a stack row into `stacks` table (adjust schema as needed)
 *  - Return the saved stack id + markdown
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = (body.submissionId ?? body.submission_id ?? "").toString().trim();
    if (!submissionId) return NextResponse.json({ error: "submissionId required" }, { status: 400 });

    // 1) Generate stack (uses typed helpers, OpenAI)
    const { markdown, raw } = await generateStackForSubmission(submissionId);

    // 2) Persist into 'stacks' table (schema: adjust to your DB)
    const payload = {
      submission_id: submissionId,
      body: markdown,
      raw_response: JSON.stringify(raw),
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("stacks")
      .upsert(payload)
      .select()
      .single();

    if (saveErr) {
      // return generated markdown even if DB save failed, but surface error info
      return NextResponse.json({ ok: true, saved: false, error: saveErr.message, markdown }, { status: 200 });
    }

    return NextResponse.json({ ok: true, submission_id: submissionId, stack_id: saved?.id ?? null, markdown }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
