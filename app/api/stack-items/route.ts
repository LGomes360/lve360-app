// app/api/stack-items/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isEligibleSupplementName, isMedicationOrHormoneName } from "@/lib/supplementEligibility";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
      .select("id,name,dose,timing, timing_bucket, timing_text, is_current, notes, link_amazon, link_fullscript")
      .eq("stack_id", stackId)
      .order("name");


    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const excludedItems: string[] = [];
    const safeItems = (items ?? []).filter((item) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      const currentKindExcluded = /^Current (?:medication|hormone|hormone-active supplement) reported in intake\./i.test(String(item?.notes ?? ""));
      const allowed = Boolean(
        name &&
        isEligibleSupplementName(name) &&
        !isMedicationOrHormoneName(name) &&
        !currentKindExcluded
      );
      if (!allowed && name) excludedItems.push(name);
      return allowed;
    });
    if (excludedItems.length) console.warn("[stack-items] filtered non-shoppable items", { stackId, excludedItems });
    return NextResponse.json({ ok: true, items: safeItems }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
