// app/api/generate-stack/route.ts
// -----------------------------------------------------------------------------
// POST /api/generate-stack
// Accepts body:
//   - submissionId: UUID (preferred)
//   - OR tally_submission_id: short Tally id (e.g. "jaJMeJQ")
// Returns JSON: { ok: true, mode, user_tier, stack, itemsInserted, ai }
// Notes:
// - Free users ARE allowed to generate their Blueprint report
// - Premium users get full stack (free can be capped by maxItems hint)
// - Robust tally resolution handles o↔0 typo tail and webhook lag
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";

// ---- helpers ----------------------------------------------------------------

function normalizeTallyCandidates(id?: string | null): string[] {
  if (!id) return [];
  const s = String(id).trim();
  if (!s) return [];
  const a = s.split("");
  const last = a[a.length - 1];
  const flipped =
    last === "o" ? (() => { a[a.length - 1] = "0"; return a.join(""); })()
  : last === "0" ? (() => { a[a.length - 1] = "o"; return a.join(""); })()
  : null;
  const set = new Set<string>([s]);
  if (flipped && flipped !== s) set.add(flipped);
  return Array.from(set);
}

// Poll Supabase briefly to wait for a row to exist (covers webhook lag)
async function waitForSubmissionByTally(
  tallyShort: string,
  timeoutMs = 7000
): Promise<string | null> {
  const start = Date.now();
  let delay = 200; // ms
  const candidates = normalizeTallyCandidates(tallyShort);

  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("id,tally_submission_id")
      .in("tally_submission_id", candidates)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[generate-stack] Error checking submission:", error);
      break;
    }
    if (data?.id) return data.id;

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 1000); // exponential backoff up to 1s
  }
  return null;
}

async function fetchSubmissionBasics(submissionId: string) {
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("id,user_id,user_email,tally_submission_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) throw new Error(`DB error reading submission: ${error.message}`);
  return data; // may be null if not found
}

async function fetchUserTierById(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`DB error reading user: ${error.message}`);
  return data; // {id,tier} | null
}

async function countItemsForStack(stackId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("stacks_items")
    .select("*", { count: "exact", head: true })
    .eq("stack_id", stackId);

  if (error) {
    console.error("[generate-stack] Count error:", error);
    return 0;
  }
  return count ?? 0;
}

async function logFailure(source: string, message: string, payload: any) {
  try {
    await supabaseAdmin.from("webhook_failures").insert({
      id: crypto.randomUUID(),
      source,
      event_type: "generator_error",
      error_message: message?.slice(0, 500) ?? "Unknown error",
      severity: "error",
      payload_json: JSON.stringify(payload ?? {}),
    });
  } catch (e) {
    // best-effort logging; never throw here
    console.warn("[generate-stack] failed to log error:", e);
  }
}

// ---- handler ----------------------------------------------------------------

export async function POST(req: NextRequest) {
  let submissionId: string | null = null;

  try {
    const body = await req.json().catch(() => ({} as any));
    submissionId =
      (body.submissionId ?? body.submission_id ?? "")?.toString().trim() || null;
    const tallyShort =
      (body.tally_submission_id ?? body.tallyId ?? body.tally ?? "")?.toString().trim() ||
      null;

    console.log("[API] /api/generate-stack received:", { submissionId, tallyShort });

    // Resolve tally → UUID if needed (with webhook lag tolerance)
    if (!submissionId && tallyShort) {
      submissionId = await waitForSubmissionByTally(tallyShort);
      if (!submissionId) {
        const msg = `Submission not found yet for tally_submission_id=${tallyShort}`;
        await logFailure("generate-stack", msg, { body });
        return NextResponse.json({ ok: false, error: msg }, { status: 409 });
      }
      console.log("[API] Resolved tally_submission_id ->", submissionId);
    }

    if (!submissionId) {
      const msg = "submissionId required (or provide tally_submission_id)";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    // Load submission (may or may not have user_id yet; Free users still allowed)
    const submission = await fetchSubmissionBasics(submissionId);
    if (!submission?.id) {
      const msg = `Submission ${submissionId} not found`;
      await logFailure("generate-stack", msg, { submissionId });
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }

    // Determine tier & mode — DO NOT block Free users
    let tier: string = "free";
    if (submission.user_id) {
      const user = await fetchUserTierById(submission.user_id);
      tier = (user?.tier ?? "free") as string;
    }
    const mode = tier === "premium" ? "premium" : "free";

    // Generate + persist via library (single source of truth)
    // Pass tier-aware hints if your generator supports it; otherwise it can ignore.
    const genFn = generateStackForSubmission as any;
    const result = await genFn(submissionId, {
      mode,                           // "free" | "premium"
      maxItems: mode === "free" ? 3 : undefined, // optional cap for Free
    });

    // Count items actually written
    const stackId = result?.raw?.stack_id as string | undefined;
    const itemsInserted = stackId ? await countItemsForStack(stackId) : 0;

    return NextResponse.json(
      {
        ok: true,
        mode,
        user_tier: tier,
        stack: result,
        itemsInserted,
        ai: { markdown: result?.markdown ?? null, raw: result?.raw ?? null },
      },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unknown error");
    console.error("[generate-stack] Unhandled error:", err);
    await logFailure("generate-stack", msg, { submissionId });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
