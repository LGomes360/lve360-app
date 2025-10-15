// app/api/get-stack/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// UUID v4
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

/**
 * GET /api/get-stack
 * Accepts any of:
 *   ?id=<stack_id> | ?stack_id=<stack_id> | ?submission_id=<uuid|short> | ?tally_submission_id=<short>
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const stackId = sp.get("id") ?? sp.get("stack_id");
    const submission = sp.get("submission_id");
    const tally = sp.get("tally_submission_id");

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
          created_at,
          updated_at
        )
      `
      )
      .limit(1);

    if (stackId) {
      query = query.eq("id", stackId);
    } else if (submission) {
      query = isUUID(submission)
        ? query.eq("submission_id", submission)
        : query.eq("tally_submission_id", submission);
    } else if (tally) {
      query = query.eq("tally_submission_id", tally);
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing identifier (id|stack_id|submission_id|tally_submission_id)",
        },
        { status: 400 }
      );
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[GET-STACK] Error fetching stack:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      console.warn(
        `[GET-STACK] No stack found for: ${
          stackId ?? submission ?? tally ?? "unknown"
        }`
      );
      return NextResponse.json(
        { ok: true, found: false, stack: null, items: [] },
        { status: 200 }
      );
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      console.warn(`[GET-STACK] Stack ${data.id} has NO child stack_items`);
    } else {
      console.log(
        `[GET-STACK] Stack ${data.id} has ${data.items.length} items`
      );
    }

    return NextResponse.json(
      { ok: true, found: true, stack: data, items: data.items ?? [] },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[GET-STACK] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
