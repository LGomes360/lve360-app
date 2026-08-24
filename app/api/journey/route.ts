import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type {
  JourneyCheckIn,
  JourneyCompletion,
  JourneyExperiment,
  JourneyReview,
  JourneySynthesis,
} from "@/lib/journey";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentBlueprintContext, getExperimentBlueprintContexts } from "@/lib/currentBlueprintContext";
import { practiceGoalOptions, resolvePracticeConnection, type PracticeGoalRow } from "@/lib/practiceConnection";

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

export async function GET() {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) {
      return NextResponse.json(
        { ok: false, error: auth.error ?? "unauthorized" },
        { status: auth.error === "premium_required" ? 403 : 401 },
      );
    }

    const admin = getSupabaseAdmin();
    const blueprintPromise = getCurrentBlueprintContext(auth.user.id);
    const [{ data: experiments, error: experimentError }, { data: reviews, error: reviewError }, { data: checkIns, error: checkInError }, { data: syntheses, error: synthesisError }, { data: goals, error: goalsError }] = await Promise.all([
      admin
        .from("weekly_experiments")
        .select("id, source_stack_id, source_action_id, connection_type, goal_id, goal_key, goal_label_snapshot, identity_direction, action_label, cue, frequency_per_week, target_quantity, quantity_unit, minimum_quantity, minimum_quantity_unit, minimum_version, status, week_start, activated_at, completed_at")
        .eq("user_id", auth.user.id)
        .order("week_start", { ascending: false })
        .limit(52),
      admin
        .from("weekly_experiment_reviews")
        .select("experiment_id, next_experiment_id, completion_count, target_count, target_quantity_per_session, quantity_unit, known_total_quantity, known_total_quantity_unit, difficulty, value_rating, decision, status, completed_at")
        .eq("user_id", auth.user.id)
        .order("completed_at", { ascending: false })
        .limit(52),
      admin
        .from("logs")
        .select("log_date, weight, sleep, energy")
        .eq("user_id", auth.user.id)
        .order("log_date", { ascending: true })
        .limit(90),
      admin
        .from("ai_weekly_syntheses")
        .select("id,experiment_id,observation,hypothesis,evidence,confidence,response_state,created_at")
        .eq("user_id", auth.user.id)
        .in("generation_status", ["succeeded", "failed", "skipped"])
        .order("created_at", { ascending: false })
        .limit(52),
      admin.from("goals").select("id,goals,custom_goal,target_weight,target_sleep,target_energy").eq("user_id", auth.user.id).maybeSingle(),
    ]);
    if (experimentError || reviewError || checkInError || synthesisError || goalsError) {
      throw experimentError ?? reviewError ?? checkInError ?? synthesisError ?? goalsError;
    }

    const experimentRows = (experiments ?? []) as JourneyExperiment[];
    const experimentIds = experimentRows.map((item) => item.id);
    let completions: JourneyCompletion[] = [];
    if (experimentIds.length) {
      const { data, error } = await admin
        .from("daily_practice_completions")
        .select("experiment_id, completion_date, completion_kind, completed_quantity, quantity_unit")
        .eq("user_id", auth.user.id)
        .in("experiment_id", experimentIds)
        .order("completion_date", { ascending: true });
      if (error) throw error;
      completions = (data ?? []) as JourneyCompletion[];
    }

    const blueprint = await blueprintPromise;
    const experimentBlueprints = await getExperimentBlueprintContexts(
      auth.user.id,
      experimentRows,
      blueprint,
    );
    const goalOptions = practiceGoalOptions((goals as PracticeGoalRow | null) ?? null);
    const practiceConnections = Object.fromEntries(experimentRows.map((experiment) => [
      experiment.id,
      resolvePracticeConnection(experiment, goalOptions, experimentBlueprints[experiment.id] ?? null),
    ]));

    return NextResponse.json({
      ok: true,
      experiments: experimentRows,
      reviews: (reviews ?? []) as JourneyReview[],
      completions,
      check_ins: (checkIns ?? []) as JourneyCheckIn[],
      syntheses: (syntheses ?? []) as JourneySynthesis[],
      blueprint,
      experiment_blueprints: experimentBlueprints,
      practice_connections: practiceConnections,
    });
  } catch (error) {
    console.error("[journey] load failed", error);
    return NextResponse.json({ ok: false, error: "journey_unavailable" }, { status: 500 });
  }
}
