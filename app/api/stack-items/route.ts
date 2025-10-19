// app/api/stack-items/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let stackId = url.searchParams.get("stack_id");

    // If only submission_id or tally_submission_id is provided, resolve to stack_id
    if (!stackId) {
      const submissionId = url.searchParams.get("submission_id");
      const tallyShort = url.searchParams.get("tally_submission_id");

      let resolvedSubmissionId = submissionId;
      if (!resolvedSubmissionId && tallyShort) {
        const { data: sub } = await supabaseAdmin
          .from("submissions")
          .select("id")
          .eq("tally_submission_id", tallyShort)
          .maybeSingle();
        resolvedSubmissionId = sub?.id ?? null;
      }

      if (resolvedSubmissionId) {
        const { data: stk } = await supabaseAdmin
          .from("stacks")
          .select("id")
          .eq("submission_id", resolvedSubmissionId)
          .maybeSingle();
        stackId = stk?.id ?? null;
      }
    }

    if (!stackId) {
      // Not an error: just no stack yet
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }

    const { data: items, error } = await supabaseAdmin
      .from("stacks_items")
      .select("id,name,dose,timing, timing_bucket, timing_text, is_current, link_amazon, link_fullscript")
      .eq("stack_id", stackId)
      .order("name");


    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: items ?? [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
