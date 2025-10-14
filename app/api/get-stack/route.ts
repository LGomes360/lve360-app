// app/api/get-stack/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Helper: UUID v4 regex
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * GET /api/get-stack
 * Accepts either:
 *   ?submission_id=<uuid>        // legacy/uuid
 *   ?tally_submission_id=<short> // preferred when you have a short id
 *
 * If only submission_id is provided and it is NOT a UUID, this route will
 * automatically treat it as a short id and match stacks.tally_submission_id.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const submissionIdParam = url.searchParams.get("submission_id");
    const tallyParam = url.searchParams.get("tally_submission_id");

    if (!submissionIdParam && !tallyParam) {
      return NextResponse.json(
        { ok: false, error: "Provide submission_id (UUID) or tally_submission_id (short id)" },
        { status: 400 }
      );
    }

    // Decide which column to match
    let query = supabaseAdmin
      .from("stacks")
      .select(
        `
        id,
        submission_id,
        tally_submission_id,
        user_email,
        summary,
        sections,
        created_at,
        updated_at,
        items: stacks_items (
          id,
          name,
          brand,
          dose,
          timing,
          notes,
          rationale,
          caution,
          citations,
          cost_estimate,
          link_amazon,
          link_thorne,
          link_fullscript,
          link_other,
          link_type,
          is_custom,
          created_at,
          updated_at
        )
      `
      )
      .limit(1);

    if (tallyParam) {
      // Explicit short id
      query = query.eq("tally_submission_id", tallyParam);
    } else if (submissionIdParam && isUUID(submissionIdParam)) {
      // Proper UUID
      query = query.eq("submission_id", submissionIdParam);
    } else if (submissionIdParam) {
      // Legacy call with a short id in submission_id param → treat as tally id
      query = query.eq("tally_submission_id", submissionIdParam);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.warn("[GET-STACK] DB error:", error);
      return NextResponse.json(
        { ok: false, error: String(error.message ?? error) },
        { status: 500 }
      );
    }

    if (!data) {
      const needle = tallyParam ?? submissionIdParam ?? "(none)";
      console.warn(`[GET-STACK] No stack found for: ${needle}`);
      return NextResponse.json(
        { ok: true, found: false, stack: null },
        { status: 200 }
      );
    }

    // Soft diagnostics
    if (!data.user_email) console.warn(`[GET-STACK] Stack ${data.id} missing user_email`);
    if (!Array.isArray(data.items) || data.items.length === 0) {
      console.warn(`[GET-STACK] Stack ${data.id} has NO child stack_items`);
    } else {
      console.log(`[GET-STACK] Stack ${data.id} has ${data.items.length} items`);
    }

    return NextResponse.json({ ok: true, found: true, stack: data }, { status: 200 });
  } catch (err: any) {
    console.error("[GET-STACK] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
