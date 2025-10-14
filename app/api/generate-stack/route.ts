// app/api/generate-stack/route.ts
// -----------------------------------------------------------------------------
// LVE360 // Generate Stack (AI-first + Safety) — 2025-10-14
//
// What this route does:
// 1) Accepts { submission_id } OR { tally_submission_id } (POST body) or via GET.
// 2) Loads submission; gets/creates a stack row for that submission.
// 3) Calls your generator (src/lib/generateStack.ts) to produce AI markdown.
//    • If the generator returns with validation warnings, we DO NOT throw.
//    • If the generator THROWS, we DO NOT 500. We mark generator_failed and
//      fall back to any previously saved markdown.
//    • We ALWAYS persist AI markdown when we have it.
// 4) Computes safety warnings and status from current items (or submission_supplements fallback).
// 5) Returns enriched payload + breadcrumbs (`trace_id`, `steps`, `generation_status`).
//
// Notes:
// • No imports inside functions (prevents build errors).
// • Idempotent and safe to re-run.
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supa } from "@/lib/supabaseAdmin";
import { evaluateSafety, type SafetyWarning } from "@/lib/safetyCheck";
import generateStackForSubmission from "@/lib/generateStack";

// -----------------------------
// Types
// -----------------------------
type SubmissionRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  tally_submission_id: string | null;
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
  tally_submission_id?: string | null;
  user_id: string | null;
  user_email: string | null;
  items: any; // jsonb array (we re-read stacks_items as needed)
  safety_status: "safe" | "warning" | "error" | null;
  safety_warnings: any | null; // jsonb[]
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
// DB helpers
// -----------------------------
async function getSubmission(submission_id: string): Promise<SubmissionRow | null> {
  const { data, error } = await supa
    .from("submissions")
    .select(
      "id, user_id, user_email, tally_submission_id, medications, conditions, pregnant, answers, engine_input_json, payload_json"
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
  // Try existing
  const { data: existing, error: findErr } = await supa
    .from("stacks")
    .select("id, submission_id, user_id, user_email, items, safety_status, safety_warnings, tally_submission_id")
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

  // Create minimal shell
  const insertPayload: Partial<StackRow> = {
    submission_id: submission.id,
    user_id: submission.user_id,
    user_email: submission.user_email,
    items: [],
    safety_status: null,
    safety_warnings: [],
    ...(submission.tally_submission_id ? { tally_submission_id: submission.tally_submission_id } : {}),
  };

  const { data: created, error: insErr } = await supa
    .from("stacks")
    .insert(insertPayload)
    .select("id, submission_id, user_id, user_email, items, safety_status, safety_warnings, tally_submission_id")
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
// POST handler
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
      return NextResponse.json({ ok: false, error: "Submission not found", trace_id, steps }, { status: 404 });
    }

    steps.push("ensure-stack");
    let stack = await getOrCreateStackForSubmission(submission);

    // --- Generate AI report (do NOT throw on validation warnings; don't 500 even if generator throws) ---
    steps.push("generate-stack");
    let ai: any = null;
    let generation_status: "ai" | "ai_with_warnings" | "generator_failed" = "ai";

    try {
      ai = await generateStackForSubmission(submission.id);
      const ok = ai?.validation?.ok ?? true;
      steps.push(ok ? "generator-ok" : "generator-ok-with-warnings");
      if (!ok) generation_status = "ai_with_warnings";
    } catch (e: any) {
      steps.push("generator-failed");
      generation_status = "generator_failed";
      await logWebhookFailure({
        event_type: "generator_error",
        error_message: e?.message ?? String(e),
        severity: "error",
        context: { trace_id, submission_id: submission.id },
      });
      // We DO NOT return 500; we will fall back to previously saved markdown if present.
    }

    // Re-select items (generator may have created them)
    steps.push("fetch-items");
    let itemRows = await getStackItems(stack.id);

    // If none yet, fallback to submission_supplements for SAFETY ONLY (no UI fallback text)
    steps.push("make-supplement-list");
    let supplementNames: string[] = itemRows
      .map((i) => (i?.name ? String(i.name).trim() : ""))
      .filter(Boolean);
    if (supplementNames.length === 0) {
      supplementNames = await getSubmissionSupplementNames(submission.id);
    }

    // Persist AI sections ALWAYS when we have markdown; else attempt to reuse any previously saved markdown
    let markdownToUse: string = String(ai?.markdown ?? "");
    if (!markdownToUse) {
      const { data: existingForMd } = await supa
        .from("stacks")
        .select("sections, summary")
        .eq("id", stack.id)
        .maybeSingle();
      const prev = (existingForMd as any)?.sections?.markdown ?? (existingForMd as any)?.summary ?? "";
      if (prev) {
        steps.push("reuse-previous-markdown");
        markdownToUse = String(prev);
      }
    }

    steps.push("persist-ai-sections");
    if (markdownToUse) {
      const { error: saveErr } = await supa
        .from("stacks")
        .update({
          summary: markdownToUse.slice(0, 800),
          sections: { markdown: markdownToUse },
          updated_at: nowIso(),
          ...(submission.tally_submission_id ? { tally_submission_id: submission.tally_submission_id } : {}),
        })
        .eq("id", stack.id);

      if (saveErr) {
        steps.push("persist-ai-sections-failed");
        await logWebhookFailure({
          event_type: "update_stack_sections_error",
          error_message: saveErr.message,
          severity: "warning",
          context: { trace_id, stack_id: stack.id },
        });
      }
    }

    // Derive user factors for safety
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

    // Optional: write a generation_runs row (ignore if table doesn't exist)
    try {
      const duration_ms = Date.now() - t0;
      await supa.from("generation_runs").insert({
        submission_id,
        trace_id,
        status: generation_status,
        steps,
        duration_ms,
        model_used: ai?.model_used ?? null,
        prompt_tokens: ai?.prompt_tokens ?? null,
        completion_tokens: ai?.completion_tokens ?? null,
        validation: ai?.validation ?? null,
      });
    } catch {
      // non-fatal
    }

    // Final re-select
    steps.push("final-select");
    const { data: finalStack } = await supa
      .from("stacks")
      .select(
        "id, submission_id, tally_submission_id, user_id, user_email, items, summary, sections, total_monthly_cost, safety_status, safety_warnings, updated_at"
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
      generation_status,
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
            validation: ai?.validation ?? null,
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
    await logWebhookFailure({
      event_type: "fatal_handler_error",
      error_message: msg,
      severity: "fatal",
      context: null,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// -----------------------------
// GET handler — accepts both ids via query
//   /api/generate-stack?submission_id=<uuid|short>
//   OR
//   /api/generate-stack?tally_submission_id=<short>
// -----------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qSubmission = searchParams.get("submission_id") ?? undefined;
  const qTally = searchParams.get("tally_submission_id") ?? undefined;

  let submission_id = qSubmission;
  if (!submission_id && qTally) {
    submission_id = (await resolveSubmissionId(qTally)) ?? undefined;
  }

  if (!submission_id) {
    return NextResponse.json(
      { ok: false, error: "Missing submission identifier (submission_id or tally_submission_id)" },
      { status: 400 }
    );
  }

  // Delegate to POST for a single code path
  return POST(
    new NextRequest(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id }),
    })
  );
}
