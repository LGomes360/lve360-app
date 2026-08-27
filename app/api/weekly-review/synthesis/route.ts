import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import type { WeeklyExperiment } from "@/lib/activation";
import { getOrCreateWeeklySynthesis } from "@/lib/ai/weeklySynthesisData";
import { normalizeMemberReportedContext } from "@/lib/memberReportedContext";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isReviewDecision, isReviewDue } from "@/lib/weeklyReview";
import type { WeeklySynthesisHistoryWeek } from "@/lib/weeklySynthesis";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const admin = getSupabaseAdmin();
    const { data: profile } = await admin.from("users").select("tier").eq("id", user.id).maybeSingle();
    if (profile?.tier !== "premium" && profile?.tier !== "trial") {
      return NextResponse.json({ ok: false, error: "premium_required" }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const experimentId = typeof body?.experiment_id === "string" ? body.experiment_id : "";
    const difficulty = Number(body?.difficulty);
    const valueRating = Number(body?.value_rating);
    if (!experimentId || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 || !Number.isInteger(valueRating) || valueRating < 1 || valueRating > 5) {
      return NextResponse.json({ ok: false, error: "invalid_synthesis_request" }, { status: 400 });
    }

    const { data: experiment, error: experimentError } = await admin.from("weekly_experiments")
      .select("*").eq("id", experimentId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (experimentError) throw experimentError;
    if (!experiment) return NextResponse.json({ ok: false, error: "experiment_not_found" }, { status: 404 });
    const typedExperiment = experiment as WeeklyExperiment;
    if (!isReviewDue(typedExperiment.week_start, new Date().toISOString().slice(0, 10))) {
      return NextResponse.json({ ok: false, error: "review_not_due" }, { status: 409 });
    }
    const weekEnd = addDays(typedExperiment.week_start, 6);
    const [{ data: completionRows, error: completionError }, { data: checkIns, error: checkInError }, { data: reviewRows, error: reviewError }] = await Promise.all([
      admin.from("daily_practice_completions").select("completion_date,completion_kind,completed_quantity,quantity_unit").eq("user_id", user.id).eq("experiment_id", experimentId)
        .gte("completion_date", typedExperiment.week_start).lte("completion_date", weekEnd).order("completion_date"),
      admin.from("logs").select("log_date,sleep,energy,notes").eq("user_id", user.id)
        .gte("log_date", typedExperiment.week_start).lte("log_date", weekEnd).order("log_date"),
      admin.from("weekly_experiment_reviews")
        .select("experiment_id,completion_count,target_count,difficulty,value_rating,decision,completed_at")
        .eq("user_id", user.id).eq("status", "completed").neq("experiment_id", experimentId)
        .order("completed_at", { ascending: false }).limit(6),
    ]);
    if (completionError || checkInError || reviewError) throw completionError ?? checkInError ?? reviewError;
    const priorExperimentIds = (reviewRows ?? []).map((row) => row.experiment_id as string);
    const { data: priorExperiments, error: priorExperimentError } = priorExperimentIds.length
      ? await admin.from("weekly_experiments")
        .select("id,identity_direction,action_label,week_start")
        .eq("user_id", user.id).in("id", priorExperimentIds)
      : { data: [], error: null };
    if (priorExperimentError) throw priorExperimentError;
    const experimentById = new Map((priorExperiments ?? []).map((row) => [row.id as string, row]));
    const history = (reviewRows ?? []).flatMap((row): WeeklySynthesisHistoryWeek[] => {
      const prior = experimentById.get(row.experiment_id as string);
      if (!prior || !isReviewDecision(row.decision)) return [];
      return [{
        experimentId: row.experiment_id as string,
        weekStart: prior.week_start as string,
        identityDirection: (prior.identity_direction ?? null) as WeeklyExperiment["identity_direction"],
        actionLabel: (prior.action_label as string | null) ?? "Weekly lifestyle practice",
        completionCount: Number(row.completion_count),
        target: Number(row.target_count),
        difficulty: Number(row.difficulty),
        valueRating: Number(row.value_rating),
        decision: row.decision,
      }];
    });
    const completedDates = (completionRows ?? []).map((row) => row.completion_date as string);
    const synthesis = await getOrCreateWeeklySynthesis(user.id, {
      experiment: typedExperiment,
      completedDates,
      completions: (completionRows ?? []).map((row) => ({
        completion_date: row.completion_date as string,
        completion_kind: row.completion_kind === "minimum" ? "minimum" : "full",
        completed_quantity: row.completed_quantity == null ? null : Number(row.completed_quantity),
        quantity_unit: (row.quantity_unit as string | null) ?? null,
      })),
      completedCount: completedDates.length,
      target: typedExperiment.frequency_per_week ?? 1,
      difficulty,
      valueRating,
      checkIns: (checkIns ?? []).map((row) => ({
        date: row.log_date,
        sleep: row.sleep,
        energy: row.energy,
        memberReportedContext: normalizeMemberReportedContext(row.notes),
      })),
      history,
    });
    return NextResponse.json({ ok: true, synthesis });
  } catch (error) {
    console.error("[weekly-synthesis] load failed", error);
    return NextResponse.json({ ok: false, error: "weekly_synthesis_unavailable" }, { status: 500 });
  }
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
