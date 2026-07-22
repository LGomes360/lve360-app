import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import type { WeeklyExperiment } from "@/lib/activation";
import {
  completionCount,
  isCompletionKind,
  parseLocalDate,
  weekBounds,
  type DailyPracticeCompletion,
} from "@/lib/today";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function requirePaidUser() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return { error: "unauthorized" as const, user: null };

  const { data: profile } = await getSupabaseAdmin()
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.tier !== "premium" && profile?.tier !== "trial") {
    return { error: "premium_required" as const, user: null };
  }
  return { error: null, user };
}

function authErrorResponse(error: "unauthorized" | "premium_required") {
  return NextResponse.json({ ok: false, error }, { status: error === "unauthorized" ? 401 : 403 });
}

async function activeExperiment(userId: string): Promise<WeeklyExperiment | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("weekly_experiments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WeeklyExperiment | null) ?? null;
}

async function loadWeek(userId: string, experiment: WeeklyExperiment) {
  const bounds = weekBounds(experiment.week_start);
  const { data, error } = await getSupabaseAdmin()
    .from("daily_practice_completions")
    .select("completion_date, completion_kind")
    .eq("user_id", userId)
    .eq("experiment_id", experiment.id)
    .gte("completion_date", bounds.start)
    .lte("completion_date", bounds.end)
    .order("completion_date", { ascending: true });
  if (error) throw error;
  const completions = (data ?? []) as DailyPracticeCompletion[];
  return { bounds, completions, completed: completionCount(completions) };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");

    const localDate = parseLocalDate(req.nextUrl.searchParams.get("date"));
    if (!localDate) return NextResponse.json({ ok: false, error: "invalid_local_date" }, { status: 400 });

    const experiment = await activeExperiment(auth.user.id);
    if (!experiment) return NextResponse.json({ ok: true, experiment: null, completions: [], completed: 0 });
    const week = await loadWeek(auth.user.id, experiment);
    return NextResponse.json({ ok: true, experiment, ...week });
  } catch (error) {
    console.error("[today] load failed", error);
    return NextResponse.json({ ok: false, error: "today_unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");

    const body = await req.json().catch(() => null);
    const localDate = parseLocalDate(body?.date);
    if (!localDate || !isCompletionKind(body?.kind)) {
      return NextResponse.json({ ok: false, error: "invalid_completion" }, { status: 400 });
    }

    const experiment = await activeExperiment(auth.user.id);
    if (!experiment) return NextResponse.json({ ok: false, error: "activation_required" }, { status: 409 });
    const experimentWeek = weekBounds(experiment.week_start);
    if (localDate < experimentWeek.start || localDate > experimentWeek.end) {
      return NextResponse.json({ ok: false, error: "date_outside_active_week" }, { status: 409 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("daily_practice_completions").upsert({
      user_id: auth.user.id,
      experiment_id: experiment.id,
      completion_date: localDate,
      completion_kind: body.kind,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,experiment_id,completion_date" });
    if (error) throw error;

    const week = await loadWeek(auth.user.id, experiment);
    return NextResponse.json({ ok: true, experiment, ...week });
  } catch (error) {
    console.error("[today] save failed", error);
    return NextResponse.json({ ok: false, error: "today_unavailable" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return authErrorResponse(auth.error ?? "unauthorized");

    const localDate = parseLocalDate(req.nextUrl.searchParams.get("date"));
    if (!localDate) return NextResponse.json({ ok: false, error: "invalid_local_date" }, { status: 400 });

    const experiment = await activeExperiment(auth.user.id);
    if (!experiment) return NextResponse.json({ ok: false, error: "activation_required" }, { status: 409 });
    const experimentWeek = weekBounds(experiment.week_start);
    if (localDate < experimentWeek.start || localDate > experimentWeek.end) {
      return NextResponse.json({ ok: false, error: "date_outside_active_week" }, { status: 409 });
    }

    const { error } = await getSupabaseAdmin()
      .from("daily_practice_completions")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("experiment_id", experiment.id)
      .eq("completion_date", localDate);
    if (error) throw error;

    const week = await loadWeek(auth.user.id, experiment);
    return NextResponse.json({ ok: true, experiment, ...week });
  } catch (error) {
    console.error("[today] undo failed", error);
    return NextResponse.json({ ok: false, error: "today_unavailable" }, { status: 500 });
  }
}
