// app/api/get-stack/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// UUID v4
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Common select with embedded items
const STACK_SELECT = `
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
`;

// Logs without crashing the route
function warn(...args: any[]) {
  try { console.warn(...args); } catch {}
}
function info(...args: any[]) {
  try { console.log(...args); } catch {}
}

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

    // 1) First attempt: exact column match based on provided params
    let q = supabaseAdmin.from("stacks").select(STACK_SELECT).limit(1);

    if (tallyParam) {
      q = q.eq("tally_submission_id", tallyParam);
    } else if (submissionIdParam && isUUID(submissionIdParam)) {
      q = q.eq("submission_id", submissionIdParam);
    } else if (submissionIdParam) {
      // Legacy calls that passed a short id in submission_id
      q = q.eq("tally_submission_id", submissionIdParam);
    }

    let { data, error } = await q.maybeSingle();

    if (error) {
      warn("[GET-STACK] DB error (primary query):", error);
      return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 500 });
    }

    // 2) Fallback: if we looked up by short id but found nothing, resolve the
    // short id to the real submission UUID and load by submission_id instead.
    const shortId =
      tallyParam ??
      (submissionIdParam && !isUUID(submissionIdParam) ? submissionIdParam : null);

    if (!data && shortId) {
      const { data: sub, error: subErr } = await supabaseAdmin
        .from("submissions")
        .select("id")
        .eq("tally_submission_id", shortId)
        .maybeSingle();

      if (subErr) {
        warn("[GET-STACK] Submissions lookup error for short id:", shortId, subErr);
      } else if (sub?.id) {
        const { data: byUuid, error: stackErr } = await supabaseAdmin
          .from("stacks")
          .select(STACK_SELECT)
          .eq("submission_id", sub.id)
          .maybeSingle();

        if (stackErr) {
          warn("[GET-STACK] Fallback stacks lookup error:", stackErr);
        } else if (byUuid) {
          // Opportunistic backfill of tally_submission_id so future reads are O(1)
          if (!byUuid.tally_submission_id) {
            await supabaseAdmin
              .from("stacks")
              .update({ tally_submission_id: shortId })
              .eq("id", byUuid.id);
          }
          data = byUuid;
        }
      }
    }

    if (!data) {
      const needle = tallyParam ?? submissionIdParam ?? "(none)";
      warn(`[GET-STACK] No stack found for: ${needle}`);
      return NextResponse.json({ ok: true, found: false, stack: null }, { status: 200 });
    }

    // Soft diagnostics
    if (!data.user_email) warn(`[GET-STACK] Stack ${data.id} missing user_email`);
    if (!Array.isArray(data.items) || data.items.length === 0) {
      warn(`[GET-STACK] Stack ${data.id} has NO child stack_items`);
    } else {
      info(`[GET-STACK] Stack ${data.id} has ${data.items.length} items`);
    }

    return NextResponse.json({ ok: true, found: true, stack: data }, { status: 200 });
  } catch (err: any) {
    warn("[GET-STACK] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
