import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  buildReminderBehaviorSuggestion,
  isReminderFeedbackType,
  sameReminderSuggestion,
  type ReminderBehaviorSuggestion,
  type ReminderFeedbackType,
} from "@/lib/reminderBehavior";
import { effectiveReminderHour, isQuietHour, localClock } from "@/lib/reminderSchedule";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExperimentRow = {
  id: string;
  reminder_preference: "none" | "email";
  reminder_timing: "account_default" | "prepare_before" | "at_cue" | "next_day";
  reminder_hour: number | null;
};

type PreferenceRow = {
  reminder_preference: "none" | "email";
  timezone: string;
  cue_hour: number;
  quiet_start_hour: number;
  quiet_end_hour: number;
};

async function authenticatedUser() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user?.id ? null : user;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadBehavior(userId: string) {
  const admin = getSupabaseAdmin();
  const [experimentResult, preferenceResult] = await Promise.all([
    admin
      .from("weekly_experiments")
      .select("id, reminder_preference, reminder_timing, reminder_hour")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("user_preferences")
      .select("reminder_preference, timezone, cue_hour, quiet_start_hour, quiet_end_hour")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (experimentResult.error || preferenceResult.error) {
    throw experimentResult.error ?? preferenceResult.error;
  }

  const activeExperiment = experimentResult.data as ExperimentRow | null;
  const preference = preferenceResult.data as PreferenceRow | null;
  if (!activeExperiment || !preference) {
    return { experiment: activeExperiment, preference, suggestion: null, feedbackCount: 0 };
  }

  const since = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const [feedbackResult, deliveryResult, completionResult, adjustmentResult] = await Promise.all([
    admin
      .from("reminder_feedback")
      .select("feedback_type, created_at")
      .eq("user_id", userId)
      .eq("experiment_id", activeExperiment.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("reminder_deliveries")
      .select("local_date, attempted_at")
      .eq("user_id", userId)
      .eq("experiment_id", activeExperiment.id)
      .in("status", ["accepted", "delivered"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("daily_practice_completions")
      .select("completion_date, created_at")
      .eq("user_id", userId)
      .eq("experiment_id", activeExperiment.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("reminder_adjustments")
      .select("adjustment_kind, current_hour, proposed_hour, created_at")
      .eq("user_id", userId)
      .eq("experiment_id", activeExperiment.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const loadError = feedbackResult.error ?? deliveryResult.error ?? completionResult.error ?? adjustmentResult.error;
  if (loadError) throw loadError;

  const lastDecisionAt = adjustmentResult.data?.[0]?.created_at
    ? new Date(String(adjustmentResult.data[0].created_at)).getTime()
    : 0;
  const feedback = (feedbackResult.data ?? [])
    .filter((row) => new Date(String(row.created_at)).getTime() > lastDecisionAt)
    .map((row) => row.feedback_type)
    .filter(isReminderFeedbackType) as ReminderFeedbackType[];
  const deliveriesByDate = new Map<string, number>();
  for (const row of deliveryResult.data ?? []) {
    const localDate = String(row.local_date || "");
    const attemptedAt = new Date(String(row.attempted_at)).getTime();
    if (!localDate || !Number.isFinite(attemptedAt) || attemptedAt <= lastDecisionAt || deliveriesByDate.has(localDate)) continue;
    // The query is newest-first. Keep the latest reminder for each date so an
    // older delivery cannot distort the observed completion delay.
    deliveriesByDate.set(localDate, attemptedAt);
  }
  const completionHours = (completionResult.data ?? []).flatMap((row) => {
    const deliveryTime = deliveriesByDate.get(String(row.completion_date));
    const completionTime = new Date(String(row.created_at)).getTime();
    if (!deliveryTime || !Number.isFinite(completionTime) || completionTime <= lastDecisionAt || completionTime < deliveryTime) return [];
    return [localClock(new Date(completionTime), preference.timezone).hour];
  });
  const currentHour = effectiveReminderHour(
    activeExperiment.reminder_timing,
    activeExperiment.reminder_hour,
    preference.cue_hour,
  );
  const candidate = activeExperiment.reminder_preference === "email" && preference.reminder_preference === "email"
    ? buildReminderBehaviorSuggestion({
        currentHour,
        quietStartHour: preference.quiet_start_hour,
        quietEndHour: preference.quiet_end_hour,
        feedback,
        completionHours,
      })
    : null;
  const alreadyResolved = candidate
    ? (adjustmentResult.data ?? []).some((row) => sameReminderSuggestion(candidate, row))
    : false;

  return {
    experiment: activeExperiment,
    preference,
    suggestion: alreadyResolved ? null : candidate,
    feedbackCount: feedback.length,
  };
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const behavior = await loadBehavior(user.id);
    return NextResponse.json({
      ok: true,
      enabled: behavior.experiment?.reminder_preference === "email" && behavior.preference?.reminder_preference === "email",
      current_hour: behavior.experiment && behavior.preference
        ? effectiveReminderHour(
            behavior.experiment.reminder_timing,
            behavior.experiment.reminder_hour,
            behavior.preference.cue_hour,
          )
        : null,
      feedback_count: behavior.feedbackCount,
      suggestion: behavior.suggestion,
    });
  } catch (error) {
    console.error("[reminder-behavior] load failed", error);
    return NextResponse.json({ ok: false, error: "behavior_unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const admin = getSupabaseAdmin();

  try {
    if (action === "feedback") {
      if (!isReminderFeedbackType(body?.feedback) || !isUuid(body?.delivery_id)) {
        return NextResponse.json({ ok: false, error: "invalid_feedback" }, { status: 400 });
      }
      const { data: delivery, error: deliveryError } = await admin
        .from("reminder_deliveries")
        .select("id, experiment_id")
        .eq("id", body.delivery_id)
        .eq("user_id", user.id)
        .in("status", ["accepted", "delivered"])
        .maybeSingle();
      if (deliveryError) throw deliveryError;
      if (!delivery) return NextResponse.json({ ok: false, error: "delivery_not_found" }, { status: 404 });

      const { error } = await admin.from("reminder_feedback").upsert({
        user_id: user.id,
        experiment_id: delivery.experiment_id,
        delivery_id: delivery.id,
        feedback_type: body.feedback,
        updated_at: new Date().toISOString(),
      }, { onConflict: "delivery_id" });
      if (error) throw error;
      const behavior = await loadBehavior(user.id);
      return NextResponse.json({ ok: true, suggestion: behavior.suggestion });
    }

    if (action !== "accept_suggestion" && action !== "decline_suggestion") {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
    }
    const behavior = await loadBehavior(user.id);
    const suggestion = behavior.suggestion;
    if (!behavior.experiment || !behavior.preference || !suggestion) {
      return NextResponse.json({ ok: false, error: "suggestion_unavailable" }, { status: 409 });
    }
    if (suggestion.kind === "time" && isQuietHour(
      suggestion.proposedHour,
      behavior.preference.quiet_start_hour,
      behavior.preference.quiet_end_hour,
    )) {
      return NextResponse.json({ ok: false, error: "suggestion_in_quiet_hours" }, { status: 409 });
    }

    if (action === "accept_suggestion") {
      const changes = suggestion.kind === "pause"
        ? { reminder_preference: "none", updated_at: new Date().toISOString() }
        : {
            reminder_timing: behavior.experiment.reminder_timing === "account_default"
              ? "at_cue"
              : behavior.experiment.reminder_timing,
            reminder_hour: suggestion.proposedHour,
            updated_at: new Date().toISOString(),
          };
      const { error: updateError } = await admin
        .from("weekly_experiments")
        .update(changes)
        .eq("id", behavior.experiment.id)
        .eq("user_id", user.id)
        .eq("status", "active");
      if (updateError) throw updateError;
    }

    const { error: auditError } = await admin.from("reminder_adjustments").insert({
      user_id: user.id,
      experiment_id: behavior.experiment.id,
      adjustment_kind: suggestion.kind,
      current_hour: suggestion.currentHour,
      proposed_hour: suggestion.proposedHour,
      trigger_reason: suggestion.reason,
      evidence_count: suggestion.evidenceCount,
      status: action === "accept_suggestion" ? "accepted" : "declined",
      resolved_at: new Date().toISOString(),
    });
    if (auditError) throw auditError;
    return NextResponse.json({ ok: true, accepted: action === "accept_suggestion" });
  } catch (error) {
    console.error("[reminder-behavior] save failed", error);
    return NextResponse.json({ ok: false, error: "behavior_unavailable" }, { status: 500 });
  }
}
