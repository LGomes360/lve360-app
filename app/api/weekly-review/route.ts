import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import type { WeeklyExperiment } from "@/lib/activation";
import {
  cleanAdaptationRationale,
  isPracticeAdaptation,
  isReviewDue,
  reviewDecisionForAdaptation,
  validateAdaptationPlan,
  type NextWeekPlan,
} from "@/lib/weeklyReview";
import { synthesisResponseState, type WeeklySynthesisContent } from "@/lib/weeklySynthesis";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { recordProductEventSafely } from "@/lib/productAnalytics";
import { getCurrentBlueprintContext, getExperimentBlueprintContexts } from "@/lib/currentBlueprintContext";
import { practiceGoalOptions, resolvePracticeConnection, type PracticeGoalRow } from "@/lib/practiceConnection";
import { coachActionFromRow, type CoachActionProposal } from "@/lib/coachActions";
import { buildWeeklyPracticeMetrics, type PracticeCompletionQuantity } from "@/lib/practiceQuantity";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const COACH_ACTION_COLUMNS = "id,source_turn_id,status,identity_direction,action_label,cue,frequency_per_week,minimum_version,rationale,confirmed_at,cancelled_at,applied_at,applied_experiment_id,created_at";

async function requirePaidUser() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return { error: "unauthorized" as const, user: null };
  const { data: profile } = await getSupabaseAdmin().from("users").select("tier").eq("id", user.id).maybeSingle();
  if (profile?.tier !== "premium" && profile?.tier !== "trial") return { error: "premium_required" as const, user: null };
  return { error: null, user };
}

function authErrorResponse(error: "unauthorized" | "premium_required") {
  return NextResponse.json({ ok: false, error }, { status: error === "unauthorized" ? 401 : 403 });
}

async function loadExperiment(userId: string, experimentId: string): Promise<WeeklyExperiment | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("weekly_experiments")
    .select("*")
    .eq("id", experimentId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data as WeeklyExperiment | null) ?? null;
}

async function loadCompletions(userId: string, experiment: WeeklyExperiment): Promise<PracticeCompletionQuantity[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("daily_practice_completions")
    .select("completion_date,completion_kind,completed_quantity,quantity_unit")
    .eq("user_id", userId)
    .eq("experiment_id", experiment.id)
    .gte("completion_date", experiment.week_start)
    .lte("completion_date", addDays(experiment.week_start, 6));
  if (error) throw error;
  return (data ?? []).map((row) => ({
    completion_date: row.completion_date as string,
    completion_kind: row.completion_kind === "minimum" ? "minimum" : "full",
    completed_quantity: row.completed_quantity == null ? null : Number(row.completed_quantity),
    quantity_unit: (row.quantity_unit as string | null) ?? null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");
    const experimentId = req.nextUrl.searchParams.get("experiment");
    if (!experimentId) return NextResponse.json({ ok: false, error: "experiment_required" }, { status: 400 });
    const experiment = await loadExperiment(auth.user.id, experimentId);
    if (!experiment) return NextResponse.json({ ok: false, error: "experiment_not_found" }, { status: 404 });
    if (!isReviewDue(experiment.week_start, todayUtc())) {
      return NextResponse.json({ ok: false, error: "review_not_due" }, { status: 409 });
    }
    const [completions, blueprint, { data: goals, error: goalsError }, { data: queuedAction, error: queuedActionError }] = await Promise.all([
      loadCompletions(auth.user.id, experiment),
      getCurrentBlueprintContext(auth.user.id),
      getSupabaseAdmin().from("goals").select("id,goals,custom_goal,target_weight,target_sleep,target_energy").eq("user_id", auth.user.id).maybeSingle(),
      getSupabaseAdmin().from("coach_action_proposals").select(COACH_ACTION_COLUMNS)
        .eq("user_id", auth.user.id).eq("status", "confirmed")
        .order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (goalsError) throw goalsError;
    if (queuedActionError) throw queuedActionError;
    const blueprintContexts = await getExperimentBlueprintContexts(auth.user.id, [experiment], blueprint);
    const practiceConnection = resolvePracticeConnection(
      experiment,
      practiceGoalOptions((goals as PracticeGoalRow | null) ?? null),
      blueprintContexts[experiment.id] ?? null,
    );
    const admin = getSupabaseAdmin();
    const metrics = buildWeeklyPracticeMetrics({
      practice: experiment.action_label,
      targetQuantity: experiment.target_quantity,
      quantityUnit: experiment.quantity_unit,
      minimumQuantity: experiment.minimum_quantity,
      minimumQuantityUnit: experiment.minimum_quantity_unit,
      plannedSessions: experiment.frequency_per_week ?? 1,
      completions,
    });
    const { error } = await admin.from("weekly_experiment_reviews").upsert({
      user_id: auth.user.id,
      experiment_id: experiment.id,
      completion_count: metrics.completed_sessions,
      target_count: experiment.frequency_per_week ?? 1,
      target_quantity_per_session: metrics.target_quantity_per_session,
      quantity_unit: metrics.quantity_unit,
      known_total_quantity: metrics.known_total_quantity,
      known_total_quantity_unit: metrics.total_quantity_unit,
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "experiment_id", ignoreDuplicates: true });
    if (error) throw error;
    await recordProductEventSafely({
      event_name: "weekly_review_opened",
      source: "weekly_review",
      user_id: auth.user.id,
      experiment_id: experiment.id,
      event_key: `review:opened:${experiment.id}`,
    });
    return NextResponse.json({
      ok: true,
      experiment,
      completed: metrics.completed_sessions,
      target: experiment.frequency_per_week ?? 1,
      metrics,
      practice_connection: practiceConnection,
      queued_coach_action: queuedAction ? coachActionFromRow(queuedAction) : null,
    });
  } catch (error) {
    console.error("[weekly-review] load failed", error);
    return NextResponse.json({ ok: false, error: "review_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const experimentId = typeof body?.experiment_id === "string" ? body.experiment_id : "";
    const adaptation = body?.adaptation;
    const rationale = cleanAdaptationRationale(body?.rationale);
    const difficulty = Number(body?.difficulty);
    const valueRating = Number(body?.value_rating);
    if (!experimentId || !isPracticeAdaptation(adaptation) || !rationale || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 || !Number.isInteger(valueRating) || valueRating < 1 || valueRating > 5) {
      return NextResponse.json({ ok: false, error: "invalid_review" }, { status: 400 });
    }
    const experiment = await loadExperiment(auth.user.id, experimentId);
    if (!experiment) return NextResponse.json({ ok: false, error: "experiment_not_found" }, { status: 404 });
    if (!isReviewDue(experiment.week_start, todayUtc())) return NextResponse.json({ ok: false, error: "review_not_due" }, { status: 409 });
    const proposalId = typeof body?.coach_action_proposal_id === "string" ? body.coach_action_proposal_id : null;
    const queuedProposal = proposalId ? await loadConfirmedCoachAction(auth.user.id, proposalId) : null;
    if (proposalId && (!queuedProposal || adaptation !== "replace")) {
      return NextResponse.json({ ok: false, error: "invalid_coach_action" }, { status: 409 });
    }
    const closesPractice = adaptation === "pause" || adaptation === "graduate";
    const nextPlan = closesPractice ? null : validateAdaptationPlan(experiment, adaptation, body?.next_plan);
    if (!closesPractice && !nextPlan) return NextResponse.json({ ok: false, error: "invalid_next_plan" }, { status: 400 });
    const decision = reviewDecisionForAdaptation(adaptation);

    const { data, error } = await getSupabaseAdmin().rpc("complete_weekly_review", {
      p_user_id: auth.user.id,
      p_experiment_id: experiment.id,
      p_difficulty: difficulty,
      p_value_rating: valueRating,
      p_decision: decision,
      p_adaptation_kind: adaptation,
      p_adaptation_rationale: rationale,
      p_action_label: nextPlan?.action_label ?? null,
      p_cue: nextPlan?.cue ?? null,
      p_frequency_per_week: nextPlan?.frequency_per_week ?? null,
      p_minimum_version: nextPlan?.minimum_version ?? null,
      p_target_quantity: nextPlan?.target_quantity ?? null,
      p_quantity_unit: nextPlan?.quantity_unit ?? null,
      p_minimum_quantity: nextPlan?.minimum_quantity ?? null,
      p_minimum_quantity_unit: nextPlan?.minimum_quantity_unit ?? null,
    });
    if (error) {
      if (/already_completed/i.test(error.message)) return NextResponse.json({ ok: false, error: "review_already_completed" }, { status: 409 });
      throw error;
    }
    const synthesisId = typeof body?.synthesis_id === "string" ? body.synthesis_id : null;
    if (synthesisId) {
      await recordSynthesisResponse(auth.user.id, synthesisId, decision, nextPlan, typeof data === "string" ? data : null);
    }
    if (queuedProposal && typeof data === "string") {
      const now = new Date().toISOString();
      const admin = getSupabaseAdmin();
      const { data: identityLink, error: identityError } = await admin.from("weekly_experiments").update({
        identity_direction: queuedProposal.identityDirection,
        updated_at: now,
      }).eq("id", data).eq("user_id", auth.user.id).select("practice_id").maybeSingle();
      if (identityError) console.warn("[weekly-review] coach action identity linkage failed", identityError.message);
      if (identityLink?.practice_id) {
        const { error: practiceIdentityError } = await admin.from("practices").update({
          identity_direction: queuedProposal.identityDirection,
          updated_at: now,
        }).eq("id", identityLink.practice_id).eq("user_id", auth.user.id);
        if (practiceIdentityError) console.warn("[weekly-review] durable practice identity linkage failed", practiceIdentityError.message);
      }
      const { error: proposalError } = await admin.from("coach_action_proposals").update({
        status: "applied",
        applied_at: now,
        applied_experiment_id: data,
        updated_at: now,
      }).eq("id", queuedProposal.id).eq("user_id", auth.user.id).eq("status", "confirmed");
      if (proposalError) console.warn("[weekly-review] coach action linkage failed", proposalError.message);
    }
    await recordProductEventSafely({
      event_name: "weekly_review_completed",
      source: "weekly_review",
      user_id: auth.user.id,
      experiment_id: experiment.id,
      event_key: `review:completed:${experiment.id}`,
    });
    return NextResponse.json({ ok: true, next_experiment_id: data ?? null });
  } catch (error) {
    console.error("[weekly-review] save failed", error);
    return NextResponse.json({ ok: false, error: "review_unavailable" }, { status: 500 });
  }
}

async function loadConfirmedCoachAction(userId: string, proposalId: string): Promise<CoachActionProposal | null> {
  const { data, error } = await getSupabaseAdmin().from("coach_action_proposals")
    .select(COACH_ACTION_COLUMNS).eq("id", proposalId).eq("user_id", userId).eq("status", "confirmed").maybeSingle();
  if (error) throw error;
  return data ? coachActionFromRow(data) : null;
}

async function recordSynthesisResponse(
  userId: string,
  synthesisId: string,
  decision: Parameters<typeof synthesisResponseState>[1],
  plan: NextWeekPlan | null,
  nextExperimentId: string | null,
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("ai_weekly_syntheses")
    .select("suggested_decision,suggested_action_label,suggested_cue,suggested_frequency_per_week,suggested_target_quantity,suggested_quantity_unit,suggested_minimum_quantity,suggested_minimum_quantity_unit,suggested_minimum_version")
    .eq("id", synthesisId).eq("user_id", userId).maybeSingle();
  if (error || !data) {
    console.warn("[weekly-review] synthesis response not recorded", error?.message ?? "not_found");
    return;
  }
  const suggestedPlan = data.suggested_decision === "pause" ? null : {
    action_label: data.suggested_action_label ?? "",
    cue: data.suggested_cue ?? "",
    frequency_per_week: data.suggested_frequency_per_week ?? 1,
    target_quantity: data.suggested_target_quantity == null ? null : Number(data.suggested_target_quantity),
    quantity_unit: data.suggested_quantity_unit ?? null,
    minimum_quantity: data.suggested_minimum_quantity == null ? null : Number(data.suggested_minimum_quantity),
    minimum_quantity_unit: data.suggested_minimum_quantity_unit ?? null,
    minimum_version: data.suggested_minimum_version ?? "",
  };
  const state = synthesisResponseState({
    suggestedDecision: data.suggested_decision as WeeklySynthesisContent["suggestedDecision"],
    suggestedPlan,
  }, decision, plan);
  const { error: updateError } = await admin.from("ai_weekly_syntheses").update({
    response_state: state,
    next_experiment_id: nextExperimentId,
    updated_at: new Date().toISOString(),
  }).eq("id", synthesisId).eq("user_id", userId);
  if (updateError) console.warn("[weekly-review] synthesis response update failed", updateError.message);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
