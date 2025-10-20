// app/api/get-stack/route.ts
// Make this API route always dynamic (no prerender) and uncached
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "no-store";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Wait briefly for the submission row (webhook lag)
async function waitForSubmissionByTally(
  tallyShort: string,
  timeoutMs = 7000
): Promise<string | null> {
  const start = Date.now();
  let delay = 200;
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("tally_submission_id", tallyShort)
      .maybeSingle();
    if (error) break;
    if (data?.id) return data.id;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 1000);
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    // Use req.nextUrl so Next.js doesn't try to statically analyze request.url
    const { searchParams } = req.nextUrl;

    let submissionId =
      searchParams.get("submission_id") ||
      searchParams.get("id") || // allow ?id= as a convenience
      null;

    const tallyShort =
      searchParams.get("tally_submission_id") ||
      searchParams.get("tally") ||
      null;

    // Resolve Tally short id -> UUID if needed
    if (!submissionId && tallyShort) {
      submissionId = await waitForSubmissionByTally(tallyShort);
      if (!submissionId) {
        // Not an error; just not ready yet (client can poll)
        return NextResponse.json(
          { ok: true, exists: false, reason: "pending_submission", submission_id: null },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      }
    }

    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: "submission_id or tally_submission_id is required" },
        {
          status: 400,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    // Look up stack by submission_id
    const { data: stack, error } = await supabaseAdmin
      .from("stacks")
      .select(
        "id, submission_id, user_id, user_email, safety_status, sections, tokens_used, prompt_tokens, completion_tokens, total_monthly_cost"
      )
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    if (!stack) {
      // No stack yet -> let UI show the "Generate Free Report" button
      return NextResponse.json(
        { ok: true, exists: false, submission_id: submissionId, stack: null },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Optionally count items
    let itemsCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from("stacks_items")
        .select("*", { count: "exact", head: true })
        .eq("stack_id", stack.id);
      itemsCount = count ?? 0;
    } catch {
      // best-effort; ignore
    }

    return NextResponse.json(
      { ok: true, exists: true, submission_id: submissionId, stack, itemsCount },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    console.error("[get-stack] unhandled:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
