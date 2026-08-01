import { NextResponse, type NextRequest } from "next/server";

import { requirePaidApi } from "@/lib/serverEntitlements";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const admin = getSupabaseAdmin();
  const requestedSubmissionId = req.nextUrl.searchParams.get("submission_id")?.trim();

  let submissionQuery = admin
    .from("submissions")
    .select("id,created_at")
    .eq("user_id", entitlement.user.id);

  submissionQuery = requestedSubmissionId
    ? submissionQuery.eq("id", requestedSubmissionId)
    : submissionQuery.order("created_at", { ascending: false }).limit(1);

  const { data: submission, error: submissionError } = await submissionQuery.maybeSingle();
  if (submissionError) {
    console.error("[blueprint-handoff] submission lookup failed", submissionError.message);
    return NextResponse.json({ ok: false, error: "handoff_unavailable" }, { status: 500 });
  }
  if (!submission) {
    return NextResponse.json({ ok: true, status: "no_submission" });
  }

  const { data: stack, error: stackError } = await admin
    .from("stacks")
    .select("id,created_at")
    .eq("submission_id", submission.id)
    .eq("user_id", entitlement.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (stackError) {
    console.error("[blueprint-handoff] stack lookup failed", stackError.message);
    return NextResponse.json({ ok: false, error: "handoff_unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: stack ? "ready" : "generating",
    submission: { id: submission.id, created_at: submission.created_at },
    stack: stack ? { id: stack.id, created_at: stack.created_at } : null,
  });
}
