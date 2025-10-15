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
 * GET /api/get-stack?submission_id=<uuid or short_id>
 */
export async function GET(req: NextRequest) {
  try {
    const submissionId = req.nextUrl.searchParams.get("submission_id") ?? null;
    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submission_id is required" },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from("stacks")
      .select(`
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
      `)
      .limit(1);

    query = isUUID(submissionId)
      ? query.eq("submission_id", submissionId)
      : query.eq("tally_submission_id", submissionId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[GET-STACK] Error fetching stack:", error);
      return NextResponse.json(
        { ok: false, error: String(error.message ?? error) },
        { status: 500 }
      );
    }

    if (!data) {
      console.warn(`[GET-STACK] No stack found for: ${submissionId}`);
      return NextResponse.json({ ok: true, found: false, stack: null }, { status: 200 });
    }

    // Additional logging: surface if user_email or items are missing
    if (!data.user_email) {
      console.warn(`[GET-STACK] Stack ${data.id} missing user_email!`);
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      console.warn(`[GET-STACK] Stack ${data.id} has NO child stack_items!`);
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
