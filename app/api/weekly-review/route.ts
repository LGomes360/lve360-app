import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import type { WeeklyExperiment } from "@/lib/activation";
import { isReviewDecision, isReviewDue, validateNextPlan } from "@/lib/weeklyReview";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

async function countCompletions(userId: string, experiment: WeeklyExperiment): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("daily_practice_completions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("experiment_id", experiment.id)
    .gte("completion_date", experiment.week_start)
    .lte("completion_date", addDays(experiment.week_start, 6));
  if (error) throw error;
  return count ?? 0;
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
    const completed = await countCompletions(auth.user.id, experiment);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("weekly_experiment_reviews").upsert({
      user_id: auth.user.id,
      experiment_id: experiment.id,
      completion_count: completed,
      target_count: experiment.frequency_per_week ?? 1,
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "experiment_id", ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, experiment, completed, target: experiment.frequency_per_week ?? 1 });
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
    const decision = body?.decision;
    const difficulty = Number(body?.difficulty);
    const valueRating = Number(body?.value_rating);
    if (!experimentId || !isReviewDecision(decision) || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 || !Number.isInteger(valueRating) || valueRating < 1 || valueRating > 5) {
      return NextResponse.json({ ok: false, error: "invalid_review" }, { status: 400 });
    }
    const experiment = await loadExperiment(auth.user.id, experimentId);
    if (!experiment) return NextResponse.json({ ok: false, error: "experiment_not_found" }, { status: 404 });
    if (!isReviewDue(experiment.week_start, todayUtc())) return NextResponse.json({ ok: false, error: "review_not_due" }, { status: 409 });
    const nextPlan = decision === "pause" ? null : validateNextPlan(body?.next_plan);
    if (decision !== "pause" && !nextPlan) return NextResponse.json({ ok: false, error: "invalid_next_plan" }, { status: 400 });

    const { data, error } = await getSupabaseAdmin().rpc("complete_weekly_review", {
      p_user_id: auth.user.id,
      p_experiment_id: experiment.id,
      p_difficulty: difficulty,
      p_value_rating: valueRating,
      p_decision: decision,
      p_action_label: nextPlan?.action_label ?? null,
      p_cue: nextPlan?.cue ?? null,
      p_frequency_per_week: nextPlan?.frequency_per_week ?? null,
      p_minimum_version: nextPlan?.minimum_version ?? null,
    });
    if (error) {
      if (/already_completed/i.test(error.message)) return NextResponse.json({ ok: false, error: "review_already_completed" }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true, next_experiment_id: data ?? null });
  } catch (error) {
    console.error("[weekly-review] save failed", error);
    return NextResponse.json({ ok: false, error: "review_unavailable" }, { status: 500 });
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
