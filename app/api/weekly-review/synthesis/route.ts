import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import type { WeeklyExperiment } from "@/lib/activation";
import { getOrCreateWeeklySynthesis } from "@/lib/ai/weeklySynthesisData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isReviewDue } from "@/lib/weeklyReview";

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
    const [{ data: completionRows, error: completionError }, { data: checkIns, error: checkInError }] = await Promise.all([
      admin.from("daily_practice_completions").select("completion_date").eq("user_id", user.id).eq("experiment_id", experimentId)
        .gte("completion_date", typedExperiment.week_start).lte("completion_date", weekEnd).order("completion_date"),
      admin.from("logs").select("log_date,sleep,energy").eq("user_id", user.id)
        .gte("log_date", typedExperiment.week_start).lte("log_date", weekEnd).order("log_date"),
    ]);
    if (completionError || checkInError) throw completionError ?? checkInError;
    const completedDates = (completionRows ?? []).map((row) => row.completion_date as string);
    const synthesis = await getOrCreateWeeklySynthesis(user.id, {
      experiment: typedExperiment,
      completedDates,
      completedCount: completedDates.length,
      target: typedExperiment.frequency_per_week ?? 1,
      difficulty,
      valueRating,
      checkIns: (checkIns ?? []).map((row) => ({ date: row.log_date, sleep: row.sleep, energy: row.energy })),
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
