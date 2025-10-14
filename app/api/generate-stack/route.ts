// -----------------------------------------------------------------------------
// File: app/api/generate-stack/route.ts
// LVE360 // Generate Stack (with Safety Integration) — 2025-10-13
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { evaluateSafety, type SafetyWarning } from "@/lib/safetyCheck";
import generateStackForSubmission from "@/lib/generateStack"; // <— call your real generator

// -----------------------------
// Types
// -----------------------------
type SubmissionRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  medications: string | null;
  conditions: string | null;
  pregnant: string | null;
  answers: any | null;
  engine_input_json: any | null;
  payload_json: any | null;
};

type StackRow = {
  id: string;
  submission_id: string;
  user_id: string | null;
  user_email: string | null;
  items: any;
  safety_status: "safe" | "warning" | "error" | null;
  safety_warnings: any | null;
};

type StackItemRow = {
  id: string;
  stack_id: string;
  name: string | null;
  user_email: string | null;
};

// -----------------------------
// Small helpers
// -----------------------------
const nowIso = () => new Date().toISOString();
const isUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

function parseListish(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .map((v) => v.trim())
      .filter(Boolean);
  }
  const raw = String(val ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|[,;]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickSafetyStatus(warnings: SafetyWarning[]): "safe" | "warning" | "error" {
  if (!warnings || warnings.length === 0) return "safe";
  if (warnings.some((w) => w.severity === "danger")) return "error";
  if (warnings.some((w) => w.severity === "warning")) return "warning";
  return "safe";
}

async function logWebhookFailure(payload: {
  event_type?: string | null;
  error_message: string;
  severity?: "info" | "warning" | "error" | "critical" | "fatal";
  event_id?: string | null;
  context?: any;
}) {
  try {
    await supa.from("webhook_failures").insert({
      source: "generate-stack",
      event_type: payload.event_type ?? null,
      event_id: payload.event_id ?? null,
      error_message: payload.error_message,
      severity: payload.severity ?? "error",
      payload_json: payload.context ?? null,
      created_at: nowIso(),
    });
  } catch (e) {
    console.error("webhook_failures insert failed:", (e as Error).message);
  }
}

async function resolveSubmissionId(maybeShortOrUuid?: string): Promise<string | null> {
  if (!maybeShortOrUuid) return null;
  if (isUUID(maybeShortOrUuid)) return maybeShortOrUuid;
  const { data, error } = await supa
    .from("submissions")
    .select("id")
    .eq("tally_submission_id", maybeShortOrUuid)
    .maybeSingle();
  if (error) {
    console.error("[GENERATE-STACK] resolveSubmissionId error:", error);
    return null;
  }
  return data?.id ?? null;
}

// -----------------------------
// DB fetches
// -----------------------------
async function getSubmission(submission_id: string): Promise<SubmissionRow | null> {
  const { data, error } = await supa
    .from("submissions")
    .select(
      "id, user_id, user_email, medications, conditions, pregnant, answers, engine_input_json, payload_json"
    )
    .eq("id", submission_id)
    .maybeSingle();

  if (error) {
    await logWebhookFailure({
      event_type: "fetch_submission_error",
      error_message: error.message,
      severity: "critical",
      context: { submission_id },
    });
    return null;
  }
  return (data as SubmissionRow) ?? null;
}

async function getOrCreateStackForSubmission(submission: SubmissionRow): Promise<StackRow> {
  const { data: existing, error: findErr } = await supa
    .from("stacks")
    .select("id, submission_id, user_id, user_email, items, safety_status, safety_warnings")
    .eq("submission_id", submission.id)
    .maybeSingle();

  if (findErr) {
    await logWebhookFailure({
      event_type: "fetch_stack_error",
      error_message: findErr.message,
      severity: "critical",
      context: { submission_id: submission.id },
    });
  }
  if (existing) return existing as StackRow;

  const insertPayload: Partial<StackRow> = {
    submission_id: submission.id,
    user_id: submission.user_id,
    user_email: submission.user_email,
    items: [],
    safety_status: null,
    safety_warnings: [],
  };

  const { data: created, error: insErr } = await supa
    .from("stacks")
    .insert(insertPayload)
    .select("id, submission_id, user_id, user_email, items, safety_status, safety_warnings")
    .single();

  if (insErr || !created) {
    await logWebhookFailure({
      event_type: "insert_stack_error",
      error_message: insErr?.message ?? "unknown_insert_error",
      severity: "critical",
      context: { submission_id: submission.id, insertPayload },
    });
    throw new Error("Failed to create stack row");
  }
  return created as StackRow;
}

async function getStackItems(stack_id: string): Promise<StackItemRow[]> {
  const { data, error } = await supa
    .from("stacks_items")
    .select("id, stack_id, name, user_email")
    .eq("stack_id", stack_id);

  if (error) {
    await logWebhookFailure({
      event_type: "fetch_stack_items_error",
      error_message: error.message,
      severity: "warning",
      context: { stack_id },
    });
    return [];
  }
  return (data as StackItemRow[]) ?? [];
}

async function getSubmissionSupplementNames(submission_id: string): Promise<string[]> {
  const { data, error } = await supa
    .from("submission_supplements")
    .select("name")
    .eq("submission_id", submission_id);
  if (error) {
    await logWebhookFailure({
      event_type: "fetch_submission_supplements_error",
      error_message: error.message,
      severity: "warning",
      context: { submission_id },
    });
    return [];
  }
  return (data ?? [])
    .map((r: any) => (r?.name ? String(r.name).trim() : ""))
    .filter(Boolean);
}

// -----------------------------
// POST handler — with breadcrumbs
// -----------------------------
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const trace_id = `gstk_${t0}_${Math.random().toString(36).slice(2, 8)}`;
  const steps: string[] = [];

  try {
    steps.push("parse-body");
    const body = await req.json().catch(() => ({}));
    let submission_id: string | undefined = body?.submission_id;
    const tally_short: string | undefined = body?.tally_submission_id;

    if (!submission_id && tally_short) {
      steps.push("resolve-short-id");
      submission_id = (await resolveSubmissionId(tally_short)) ?? undefined;
    }

    if (!submission_id) {
      steps.push("missing-id");
      return NextResponse.json(
        { ok: false, error: "Missing submission identifier (submission_id or tally_submission_id)", trace_id, steps },
        { status: 400 }
      );
    }

    steps.push("fetch-submission");
    const submission = await getSubmission(submission_id);
    if (!submission) {
      steps.push("submission-not-found");
      return NextResponse.json(
        { ok: false, error: "Submission not found", trace_id, steps },
        { status: 404 }
      );
    }

    steps.push("ensure-stack");
    let stack = await getOrCreateStackForSubmission(submission);

    // 🔥 Call your generator (returns markdown + token stats, etc.)
    steps.push("generate-stack");
    let ai: any = null;
    try {
      ai = await generateStackForSubmission(submission.id);
      steps.push("generator-ok");
    } catch (e: any) {
      steps.push("generator-failed");
      await logWebhookFailure({
        event_type: "generator_error",
        error_message: e?.message ?? String(e),
        severity: "error",
        context: { trace_id, submission_id: submission.id },
      });
      // Continue; we still try safety on whatever data exists
    }

    // Re-select items (may have been created by generator)
    steps.push("fetch-items");
    let itemRows = await getStackItems(stack.id);

    // If nothing yet, fallback to submission_supplements
    steps.push("make-supplement-list");
    let supplementNames: string[] = itemRows
      .map((i) => (i?.name ? String(i.name).trim() : ""))
      .filter(Boolean);
    if (supplementNames.length === 0) {
      supplementNames = await getSubmissionSupplementNames(submission.id);
    }

    steps.push("derive-user-factors");
    const medications = parseListish(submission.medications);
    const conditions = parseListish(submission.conditions);
    const pregnant = (submission.pregnant ?? "").trim() || null;

    // Safety evaluation
    steps.push("safety-eval");
    const safetyWarnings = await evaluateSafety({
      medications,
      supplements: supplementNames,
      conditions,
      pregnant,
    });
    const safetyStatus = pickSafetyStatus(safetyWarnings);

    // Persist safety
    steps.push("persist-safety");
    const { error: updErr } = await supa
      .from("stacks")
      .update({
        safety_status: safetyStatus,
        safety_warnings: safetyWarnings,
        updated_at: nowIso(),
      })
      .eq("id", stack.id);
    if (updErr) {
      steps.push("persist-safety-failed");
      await logWebhookFailure({
        event_type: "update_stack_safety_error",
        error_message: updErr.message,
        severity: "critical",
        context: { trace_id, stack_id: stack.id, safetyStatus },
      });
    }

    // Final re-select (try to get markdown/sections)
    steps.push("final-select");
    const { data: finalStack } = await supa
      .from("stacks")
      .select(
        "id, submission_id, user_id, user_email, items, summary, sections, total_monthly_cost, safety_status, safety_warnings, updated_at"
      )
      .eq("id", stack.id)
      .maybeSingle();

    if (!itemRows || itemRows.length === 0) {
      steps.push("items-recheck");
      itemRows = await getStackItems(stack.id);
    }

    const ok = true;
    const duration_ms = Date.now() - t0;
    console.log(`[GENERATE-STACK ${trace_id}] done in ${duration_ms}ms steps=${steps.join(" > ")}`);

    return NextResponse.json({
      ok,
      trace_id,
      duration_ms,
      steps,
      submission_id,
      stack: finalStack ?? stack,
      items: itemRows,
      ai: ai
        ? {
            markdown: ai?.markdown ?? null,
            model_used: ai?.model_used ?? null,
            tokens_used: ai?.tokens_used ?? null,
            prompt_tokens: ai?.prompt_tokens ?? null,
            completion_tokens: ai?.completion_tokens ?? null,
          }
        : null,
      safety: {
        status: safetyStatus,
        warnings: safetyWarnings,
        counts: {
          total: safetyWarnings.length,
          danger: safetyWarnings.filter((w) => w.severity === "danger").length,
          warning: safetyWarnings.filter((w) => w.severity === "warning").length,
          info: safetyWarnings.filter((w) => w.severity === "info").length,
        },
      },
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[GENERATE-STACK fatal]", msg, "trace_id=");
    await logWebhookFailure({
      event_type: "fatal_handler_error",
      error_message: msg,
      severity: "fatal",
      context: null,
    });
    return NextResponse.json(
      { ok: false, error: msg, trace_id, steps },
      { status: 500 }
    );
  }
}

// -----------------------------
// GET handler (accepts ?submission_id=UUID or ?tally_submission_id=short)
// -----------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let submission_id = searchParams.get("submission_id") ?? undefined;
  const shortId = searchParams.get("tally_submission_id") ?? undefined;

  if (!submission_id && shortId) {
    submission_id = (await resolveSubmissionId(shortId)) ?? undefined;
  }
  if (!submission_id) {
    return NextResponse.json(
      { ok: false, error: "Missing submission identifier (submission_id or tally_submission_id)" },
      { status: 400 }
    );
  }

  // Delegate to POST to reuse the exact same path
  return POST(
    new NextRequest(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id }),
    })
  );
}
