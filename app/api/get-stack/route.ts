// app/api/get-stack/route.ts
// -----------------------------------------------------------------------------
// Force dynamic rendering because we use searchParams (request-specific)
// -----------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/get-stack?submission_id=<uuid>
 * Returns: { ok: true, stack: {...} } or { ok: false, error: "..."}
 */
export async function GET(req: NextRequest) {
  try {
    const submissionId = req.nextUrl.searchParams.get("submission_id") ?? null;
    if (!submissionId) {
      return NextResponse.json({ ok: false, error: "submission_id is required" }, { status: 400 });
    }

    const resp: any = await supabaseAdmin
      .from("stacks")
      .select("*")
      .eq("submission_id", submissionId)
      .limit(1)
      .maybeSingle();

    if (resp?.error) {
      console.error("Error fetching stack:", resp.error);
      return NextResponse.json({ ok: false, error: String(resp.error?.message ?? resp.error) }, { status: 500 });
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
