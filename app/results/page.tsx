// -----------------------------------------------------------------------------
// File: app/api/generate-stack/route.ts
// LVE360 // API Route
// Generates a supplement stack (free or premium) for a given submission.
// Accepts either Supabase UUID (submission_id) or Tally short ID (tally_submission_id).
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { generateStack } from "@/lib/generateStack";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Incoming payload:", body);

    const submissionId: string | null = body?.submission_id ?? null;
    const tallyId: string | null = body?.tally_submission_id ?? null;

    if (!submissionId && !tallyId) {
      return NextResponse.json(
        { ok: false, error: "Missing submission_id or tally_submission_id" },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // Step 1: Fetch submission from Supabase
    // -------------------------------------------------------------------------
    const { data: submission, error: fetchErr } = await supa
      .from("submissions")
      .select("*")
      .or(
        [
          submissionId ? `id.eq.${submissionId}` : null,
          tallyId ? `tally_submission_id.eq.${tallyId}` : null,
        ]
          .filter(Boolean)
          .join(",")
      )
      .single();

    if (fetchErr || !submission) {
      console.error("Supabase fetch error:", fetchErr);
      return NextResponse.json(
        { ok: false, error: "Submission not found" },
        { status: 404 }
      );
    }

    // -------------------------------------------------------------------------
    // Step 2: Generate the stack (AI engine)
    // -------------------------------------------------------------------------
    let stack;
    try {
      stack = await generateStack(submission);
    } catch (aiErr: any) {
      console.error("generateStack failed:", aiErr);
      return NextResponse.json(
        { ok: false, error: `Stack generation failed: ${aiErr.message}` },
        { status: 500 }
      );
    }

    // -------------------------------------------------------------------------
    // Step 3: Persist result back into Supabase (optional but recommended)
    // -------------------------------------------------------------------------
    try {
      await supa
        .from("stacks")
        .upsert(
          {
            submission_id: submission.id,
            tally_submission_id: submission.tally_submission_id,
            stack_json: stack,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "submission_id" }
        );
    } catch (persistErr: any) {
      console.error("Failed to persist stack:", persistErr);
      // Continue anyway — don’t block user
    }

    // -------------------------------------------------------------------------
    // Step 4: Return success
    // -------------------------------------------------------------------------
    return NextResponse.json({ ok: true, stack });
  } catch (err: any) {
    console.error("Fatal generate-stack error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
