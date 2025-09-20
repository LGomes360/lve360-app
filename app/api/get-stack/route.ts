// app/api/get-stack/route.ts
// -----------------------------------------------------------------------------
// Force dynamic rendering because we use searchParams (request-specific)
// -----------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Helper: quick regex UUID v4 check
function isUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * GET /api/get-stack?submission_id=<uuid or short_id>
 * Returns: { ok: true, found: true|false, stack: {...}|null }
 */
export async function GET(req: NextRequest) {
  try {
    const submissionId = req.nextUrl.searchParams.get("submission_id") ?? null;
    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "submission_id is required" }, { status: 400 });
    }

    let query = supabaseAdmin.from("stacks").select("*").limit(1);

    if (isUUID(submissionId)) {
      query = query.eq("submission_id", submissionId);
    } else {
      query = query.eq("tally_submission_id", submissionId);
    }

    const resp: any = await query.maybeSingle();

    if (resp?.error) {
      console.error("Error fetching stack:", resp.error);
      return NextResponse.json(
        { ok: false, error: String(resp.error?.message ?? resp.error) },
        { status: 500 }
      );
    }

    if (!resp?.data) {
      return NextResponse.json({ ok: true, found: false, stack: null }, { status: 200 });
    }

    return NextResponse.json({ ok: true, found: true, stack: resp.data }, { status: 200 });
  } catch (err: any) {
    console.error("Unhandled error in GET /api/get-stack:", err);
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
