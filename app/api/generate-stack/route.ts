// app/api/generate-stack/route.ts
// -----------------------------------------------------------------------------
// POST /api/generate-stack
// Body:
//   - submissionId: UUID (preferred)
//   - OR tally_submission_id: short Tally id (e.g., "jaJMeJQ")
// Behavior:
//   - Free users CAN generate (mode="free", optional cap hint)
//   - Premium users get full stack (mode="premium")
//   - Robust tally resolution (handles o↔0 tail) + webhook lag backoff
//   - Generator errors are caught; we return a graceful fallback (0 items)
// Returns: { ok: true, mode, user_tier, stack, itemsInserted, ai }
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateStackForSubmission } from "@/lib/generateStack";

// Ensure long-running LLM work won’t time out on Vercel
export const dynamic = "force-dynamic";
export const runtime = "nodejs";       // use Node functions, not edge
export const maxDuration = 110;        // seconds (pick 60–120 for safety)


// ---- local types ------------------------------------------------------------
type Tier = "free" | "premium" | "unknown";
type Mode = "free" | "premium";

interface SubmissionRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  tally_submission_id: string | null;
}

interface UserRow {
  id: string;
  tier: string | null;
}

interface FallbackResult {
  markdown: string;
  raw: {
    stack_id: string;
    items: any[];
    safety_status: "warning";
    safety_warnings: string[];
  };
}

// ---- tiny local wrapper to avoid TS bark if generator lacks 2nd arg ---------
// (When you update the generator signature in A2, this cast will still be fine.)
async function callGenerator(
  submissionId: string,
  options: { mode: Mode; maxItems?: number }
): Promise<any> {
  const fn = generateStackForSubmission as unknown as (
    id: string,
    opts?: { mode?: Mode; maxItems?: number }
  ) => Promise<any>;
  return fn(submissionId, options);
}

// ---- helpers ----------------------------------------------------------------

function normalizeTallyCandidates(id?: string | null): string[] {
  if (!id) return [];
  const s = String(id).trim();
  if (!s) return [];
  const a = s.split("");
  const last = a[a.length - 1];
  const flipped =
    last === "o"
      ? (() => {
          a[a.length - 1] = "0";
          return a.join("");
        })()
      : last === "0"
      ? (() => {
          a[a.length - 1] = "o";
          return a.join("");
        })()
      : null;
  const set = new Set<string>([s]);
  if (flipped && flipped !== s) set.add(flipped);
  return Array.from(set);
}

// Poll briefly to wait for webhook to insert the submission row
async function waitForSubmissionByTally(
  tallyShort: string,
  timeoutMs = 7000
): Promise<string | null> {
  const start = Date.now();
  let delay = 200;
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
    delay = Math.min(delay * 2, 1000); // backoff up to 1s
  }
  return null;
}

async function fetchSubmissionBasics(submissionId: string): Promise<SubmissionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("submissions")
    .select("id,user_id,user_email,tally_submission_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw new Error(`DB error reading submission: ${error.message}`);
  return (data as SubmissionRow) ?? null;
}

async function fetchUserTierById(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,tier")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`DB error reading user: ${error.message}`);
  return (data as UserRow) ?? null;
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

async function logFailure(source: string, message: string, payload: unknown): Promise<void> {
  try {
    await supabaseAdmin.from("webhook_failures").insert({
      // let DB default handle id if present
      source,
      event_type: "generator_error",
      error_message: String(message).slice(0, 500),
      severity: "error",
      payload_json: JSON.stringify(payload ?? {}),
    });
  } catch (e) {
    console.warn("[generate-stack] failed to log error:", e);
  }
}

function fallbackMarkdown(email: string | null, warnings: string[]): string {
  const w = warnings.length ? warnings.map((x) => `- ${x}`).join("\n") : "- Unknown error";
  return [
    "# LVE360 Personalized Blueprint",
    email ? `**Email:** ${email}` : "",
    "**Safety:** WARNING",
    "**Warnings:**",
    w,
    "",
    "## Your Stack",
    "_We couldn’t complete generation just now. Please retry in a moment._",
  ]
    .filter(Boolean)
    .join("\n");
}

async function ensureFallbackStack(
  submission: SubmissionRow,
  warnings: string[]
): Promise<FallbackResult> {
  // Ensure a stacks row exists with empty items + warnings
  let stackId: string | null = null;

  const { data: existing } = await supabaseAdmin
    .from("stacks")
    .select("id")
    .eq("submission_id", submission.id)
    .maybeSingle();

  if (existing?.id) {
    stackId = existing.id;
    await supabaseAdmin
      .from("stacks")
      .update({
        user_id: submission.user_id,
        items: [] as any[],
        safety_status: "warning",
        safety_warnings: warnings,
      })
      .eq("id", stackId);
    // Best-effort clear items to avoid stale children
    await supabaseAdmin.from("stacks_items").delete().eq("stack_id", stackId);
  } else {
    const { data: ins } = await supabaseAdmin
      .from("stacks")
      .insert({
        submission_id: submission.id,
        user_id: submission.user_id,
        items: [] as any[],
        safety_status: "warning",
        safety_warnings: warnings,
      })
      .select("id")
      .maybeSingle();
    stackId = ins?.id ?? null;
  }

  if (!stackId) {
    // If even that fails, synthesize a local response
    return {
      markdown: fallbackMarkdown(submission.user_email, warnings),
      raw: { stack_id: "unknown", items: [], safety_status: "warning", safety_warnings: warnings },
    };
  }

  return {
    markdown: fallbackMarkdown(submission.user_email, warnings),
    raw: { stack_id: stackId, items: [], safety_status: "warning", safety_warnings: warnings },
  };
}
// Hard wall to avoid Vercel 110s function timeout
const HARD_TIMEOUT_MS = 95_000; // keep this < maxDuration*1000

class TimeoutError extends Error {
  constructor(message = "generator timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, ms = HARD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ---- handler ----------------------------------------------------------------

export async function POST(req: NextRequest) {
  let submissionId: string | null = null;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    submissionId =
      (body["submissionId"] ?? body["submission_id"] ?? "")?.toString().trim() || null;

    const tallyShort =
      (body["tally_submission_id"] ?? body["tallyId"] ?? body["tally"] ?? "")?.toString().trim() ||
      null;

    console.info("[API] /api/generate-stack received:", { submissionId, tallyShort });

    // Resolve tally → UUID if needed (tolerate webhook lag)
    if (!submissionId && tallyShort) {
      submissionId = await waitForSubmissionByTally(tallyShort);
      if (!submissionId) {
        const msg = `Submission not found yet for tally_submission_id=${tallyShort}`;
        await logFailure("generate-stack", msg, { body });
        return NextResponse.json({ ok: false, error: msg }, { status: 409 });
      }
      console.info("[API] Resolved tally_submission_id ->", submissionId);
    }

    if (!submissionId) {
      const msg = "submissionId required (or provide tally_submission_id)";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    // Load submission to resolve user + tier
    const submission = await fetchSubmissionBasics(submissionId);
    if (!submission?.id) {
      const msg = `Submission ${submissionId} not found`;
      await logFailure("generate-stack", msg, { submissionId });
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }

    // Determine tier but DO NOT block Free users
    let tier: Tier = "free";
    if (submission.user_id) {
      const user = await fetchUserTierById(submission.user_id);
      tier = user?.tier === "premium" ? "premium" : "free";
    }
    const mode: Mode = tier === "premium" ? "premium" : "free";

    // Generate & persist (single source of truth in the generator)
    // Hint: cap Free stacks; Premium uncapped (or higher cap).
// Generate & persist (soft, timed)
let result: any;
try {
  result = await withTimeout(
    callGenerator(submissionId, {
      mode,
      maxItems: mode === "free" ? 12 : undefined,
    }),
    HARD_TIMEOUT_MS
  );

} catch (genErr: unknown) {
  const isTimeout = genErr instanceof TimeoutError;
  const msg = isTimeout
    ? "Generation timed out. Returning safe fallback."
    : (genErr as any)?.message ?? String(genErr);

  console.error("[generate-stack] generator soft-fail:", msg);
  await logFailure("generate-stack", msg, { submissionId, mode });

  // Soft fallback: create/refresh an empty warning stack so UI can render
  const fb = await ensureFallbackStack(submission, [
    isTimeout
      ? "Generation took too long. Please retry."
      : "Generation temporarily failed. Please retry.",
  ]);

  return NextResponse.json(
    {
      ok: true,
      mode,
      user_tier: tier,
      stack: fb,
      itemsInserted: 0,
      ai: { markdown: fb.markdown, raw: fb.raw },
    },
    { status: 200 }
  );
}


    // Count items actually written (best-effort)
    const stackId: string | undefined = result?.raw?.stack_id;
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
  } catch (err: unknown) {
    const msg = (err as any)?.message ? String((err as any).message) : String(err);
    console.error("[generate-stack] Unhandled error:", err);
    await logFailure("generate-stack", msg, { submissionId });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
