// app/api/generate-stack/route.ts
// -----------------------------------------------------------------------------
// POST /api/generate-stack
// Accepts body:
//   - submissionId: UUID (preferred)
//   - OR tally_submission_id: short Tally id (e.g. "jaJMeJQ")
//
// Returns JSON: { ok: true, stack, itemsInserted, ai }
// -----------------------------------------------------------------------------
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";

// Poll Supabase briefly to wait for a row to exist (covers webhook lag)
async function waitForSubmission(tallyId: string, timeoutMs = 7000) {
  const start = Date.now();
  let delay = 200; // ms
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("tally_submission_id", tallyId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error checking submission:", error);
      break;
    }
    if (data?.id) return data.id;

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 1000); // exponential backoff up to 1s
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let submissionId =
      (body.submissionId ?? body.submission_id ?? "")?.toString().trim() || null;
    const tallyShort =
      (
        body.tally_submission_id ??
        body.tallyId ??
        body.tally ??
        ""
      )?.toString().trim() || null;

    console.log("[API] generate-stack received:", { submissionId, tallyShort });

    // Resolve tally → UUID if needed
    if (!submissionId && tallyShort) {
      // 👇 new: wait briefly in case webhook hasn’t inserted yet
      submissionId = await waitForSubmission(tallyShort);

      if (!submissionId) {
        return NextResponse.json(
          {
            ok: false,
            error: `Submission not found yet for tally_submission_id=${tallyShort}`,
          },
          { status: 409 } // conflict: likely still processing
        );
      }
      console.log("[API] Resolved tally_submission_id →", submissionId);
    }

    if (!submissionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "submissionId required (or provide tally_submission_id)",
        },
        { status: 400 }
      );
    }

    // ✅ Single source of truth — let the lib handle all DB writes
    const result = await generateStackForSubmission(submissionId);

    // Count items actually written
    let itemsInserted = 0;
    if (result?.raw?.stack_id) {
      const { count } = await supabaseAdmin
        .from("stacks_items")
        .select("*", { count: "exact", head: true })
        .eq("stack_id", result.raw.stack_id);

      itemsInserted = count ?? 0;
    }

    return NextResponse.json(
      {
        ok: true,
        stack: result,
        itemsInserted,
        ai: { markdown: result.markdown, raw: result.raw },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Unhandled error in generate-stack:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
