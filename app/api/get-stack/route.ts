// app/api/get-stack/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Helper: UUID v4 regex
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

/**
 * GET /api/get-stack
 * Accepts either:
 *   ?submission_id=<UUID or short Tally id>
 *   OR
 *   ?tally_submission_id=<short Tally id>
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    // Prefer explicit tally param; else use submission_id (which can be UUID or short id)
    const explicitTally = searchParams.get("tally_submission_id");
    const raw = explicitTally ?? searchParams.get("submission_id");

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing identifier (submission_id or tally_submission_id)" },
        { status: 400 }
      );
    }

    // Build the base select with a related items selection
    let base = supabaseAdmin
      .from("stacks")
      .select(
        `
        id,
        submission_id,
        tally_submission_id,
        user_id,
        user_email,
        summary,
        sections,
        total_monthly_cost,
        safety_status,
        safety_warnings,
        created_at,
        updated_at,
        items:stacks_items(
          id,
          stack_id,
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

    // If explicit tally provided, use that; otherwise interpret submission_id
    let query =
      explicitTally != null
        ? base.eq("tally_submission_id", explicitTally)
        : isUUID(raw!)
        ? base.eq("submission_id", raw!)
        : base.eq("tally_submission_id", raw!);

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[GET-STACK] Error fetching stack:", error);
      return NextResponse.json(
        { ok: false, error: String(error.message ?? error) },
        { status: 500 }
      );
    }

    if (!data) {
      console.warn(`[GET-STACK] No stack found for: ${raw}`);
      return NextResponse.json({ ok: true, found: false, stack: null }, { status: 200 });
    }

    // Helpful logs
    if (!data.user_email) {
      console.warn(`[GET-STACK] Stack ${data.id} missing user_email!`);
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      console.warn(`[GET-STACK] Stack ${data.id} has NO child stacks_items!`);
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
