import { NextResponse, type NextRequest } from "next/server";

import { recordProductEventSafely } from "@/lib/productAnalytics";
import {
  addDays,
  effectiveReminderHour,
  evaluateReminder,
  reminderIdempotencyKey,
  sendReminderEmail,
  shouldLedgerSkip,
  skippedReminderIdempotencyKey,
} from "@/lib/reminders";
import { isReminderTiming, type ReminderKind, type ReminderTiming } from "@/lib/reminderSchedule";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_EMAIL_REMINDERS_PER_LOCAL_DAY = 1;

type ExperimentRow = {
  id: string;
  user_id: string;
  week_start: string;
  action_label: string;
  minimum_version: string;
  frequency_per_week: number;
  reminder_timing: ReminderTiming | null;
  reminder_hour: number | null;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: experiments, error } = await admin
    .from("weekly_experiments")
    .select("id, user_id, week_start, action_label, minimum_version, frequency_per_week, reminder_timing, reminder_hour")
    .eq("status", "active")
    .eq("reminder_preference", "email")
    .limit(500);
  if (error) {
    console.error("[reminders] experiment load failed", error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const skipReasons: Record<string, number> = {};
  const failureReasons: Record<string, number> = {};
  const countSkip = (reason: string) => {
    skipped += 1;
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  };
  const countFailure = (reason: string) => {
    failed += 1;
    failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
  };

  for (const experiment of (experiments ?? []) as ExperimentRow[]) {
    try {
      const [
        { data: preferences, error: preferenceError },
        { data: profiles, error: profileError },
      ] = await Promise.all([
        admin
          .from("user_preferences")
          .select("reminder_preference, timezone, cue_hour, quiet_start_hour, quiet_end_hour")
          .eq("user_id", experiment.user_id)
          .limit(1),
        admin.from("users").select("email, tier").eq("id", experiment.user_id).limit(1),
      ]);
      if (preferenceError || profileError) {
        countFailure(preferenceError ? "preference_lookup_failed" : "profile_lookup_failed");
        console.error("[reminders] member context load failed", {
          experimentId: experiment.id,
          preferenceCode: preferenceError?.code,
          profileCode: profileError?.code,
        });
        continue;
      }
      const preference = preferences?.[0];
      const profile = profiles?.[0];
      if (!preference) {
        countSkip("missing_preference");
        continue;
      }
      if (
        preference.reminder_preference !== "email"
        || !profile?.email
        || (profile.tier !== "premium" && profile.tier !== "trial")
      ) {
        countSkip(
          preference?.reminder_preference !== "email"
            ? "account_opted_out"
            : !profile?.email
              ? "missing_email"
              : "ineligible_tier",
        );
        continue;
      }

      const weekEnd = addDays(experiment.week_start, 6);
      const [
        { data: completions, error: completionsError },
        { data: review, error: reviewError },
      ] = await Promise.all([
        admin
          .from("daily_practice_completions")
          .select("completion_date")
          .eq("user_id", experiment.user_id)
          .eq("experiment_id", experiment.id)
          .gte("completion_date", experiment.week_start)
          .lte("completion_date", weekEnd),
        admin
          .from("weekly_experiment_reviews")
          .select("status")
          .eq("experiment_id", experiment.id)
          .eq("status", "completed")
          .maybeSingle(),
      ]);
      if (completionsError || reviewError) {
        throw completionsError ?? reviewError;
      }

      const timing = isReminderTiming(experiment.reminder_timing)
        ? experiment.reminder_timing
        : "account_default";
      const cueHour = effectiveReminderHour(timing, experiment.reminder_hour, preference.cue_hour);
      const completedDates = (completions ?? []).map((item) => item.completion_date);
      const evaluation = evaluateReminder({
        now,
        timezone: preference.timezone,
        cueHour,
        quietStartHour: preference.quiet_start_hour,
        quietEndHour: preference.quiet_end_hour,
        weekStart: experiment.week_start,
        completedDates,
        reviewCompleted: review?.status === "completed",
        targetCount: experiment.frequency_per_week ?? 1,
        timing,
      });
      if (!evaluation.decision) {
        countSkip(evaluation.reason);
        if (shouldLedgerSkip(evaluation.reason)) {
          const skipKind: ReminderKind = evaluation.reason === "review_complete"
            ? "weekly_review"
            : timing === "next_day"
              ? "next_day_checkin"
              : "practice";
          const skipKey = skippedReminderIdempotencyKey(
            experiment.id,
            evaluation.localDate,
            evaluation.reason,
          );
          const { error: skipError } = await admin.from("reminder_deliveries").insert({
            user_id: experiment.user_id,
            experiment_id: experiment.id,
            reminder_kind: skipKind,
            reminder_timing: timing,
            local_date: evaluation.localDate,
            target_date: timing === "next_day" ? addDays(evaluation.localDate, -1) : evaluation.localDate,
            idempotency_key: skipKey,
            status: "skipped",
            skip_reason: evaluation.reason,
            attempted_at: new Date().toISOString(),
          });
          if (skipError && skipError.code !== "23505") {
            console.error("[reminders] skip ledger failed", {
              experimentId: experiment.id,
              code: skipError.code,
            });
          }
        }
        continue;
      }
      const decision = evaluation.decision;

      const { count: remindersToday, error: dailyLimitError } = await admin
        .from("reminder_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", experiment.user_id)
        .eq("local_date", decision.localDate)
        .in("status", ["queued", "accepted", "delivered"]);
      if (dailyLimitError) throw dailyLimitError;
      if ((remindersToday ?? 0) >= MAX_EMAIL_REMINDERS_PER_LOCAL_DAY) {
        countSkip("daily_limit");
        const skipKey = skippedReminderIdempotencyKey(experiment.id, decision.localDate, "daily_limit");
        const { error: skipError } = await admin.from("reminder_deliveries").insert({
          user_id: experiment.user_id,
          experiment_id: experiment.id,
          reminder_kind: decision.kind,
          reminder_timing: timing,
          local_date: decision.localDate,
          target_date: decision.targetDate,
          idempotency_key: skipKey,
          status: "skipped",
          skip_reason: "daily_limit",
          attempted_at: new Date().toISOString(),
        });
        if (skipError && skipError.code !== "23505") throw skipError;
        continue;
      }

      const key = reminderIdempotencyKey(
        decision.kind,
        experiment.id,
        decision.localDate,
        decision.targetDate,
      );
      const { data: delivery, error: claimError } = await admin
        .from("reminder_deliveries")
        .insert({
          user_id: experiment.user_id,
          experiment_id: experiment.id,
          reminder_kind: decision.kind,
          reminder_timing: timing,
          local_date: decision.localDate,
          target_date: decision.targetDate,
          idempotency_key: key,
        })
        .select("id")
        .single();
      if (claimError?.code === "23505") {
        countSkip("already_delivered");
        continue;
      }
      if (claimError || !delivery) throw claimError ?? new Error("delivery_claim_failed");

      if (decision.kind === "weekly_review") {
        const { data: resolvedReview, error: resolvedReviewError } = await admin
          .from("weekly_experiment_reviews")
          .select("id")
          .eq("experiment_id", experiment.id)
          .eq("status", "completed")
          .maybeSingle();
        if (resolvedReviewError) throw resolvedReviewError;
        if (resolvedReview) {
          await admin.from("reminder_deliveries").update({
            status: "skipped",
            skip_reason: "resolved_before_send",
            attempted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          countSkip("resolved_before_send");
          continue;
        }
      } else {
        const { data: resolvedCompletion, error: resolvedError } = await admin
          .from("daily_practice_completions")
          .select("id")
          .eq("user_id", experiment.user_id)
          .eq("experiment_id", experiment.id)
          .eq("completion_date", decision.targetDate)
          .maybeSingle();
        if (resolvedError) throw resolvedError;
        if (resolvedCompletion) {
          await admin.from("reminder_deliveries").update({
            status: "skipped",
            skip_reason: "resolved_before_send",
            attempted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          countSkip("resolved_before_send");
          continue;
        }
      }

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://lve360.com").replace(/\/$/, "");
      const path = decision.kind === "weekly_review"
        ? `/review?experiment=${encodeURIComponent(experiment.id)}&source=reminder`
        : decision.kind === "next_day_checkin"
          ? `/today?checkin=${encodeURIComponent(decision.targetDate)}&source=reminder`
          : `/today?experiment=${encodeURIComponent(experiment.id)}&source=reminder`;
      const deepLink = new URL(path, `${appUrl}/`);
      if (decision.kind !== "weekly_review") deepLink.searchParams.set("reminder_delivery", delivery.id);
      const result = await sendReminderEmail({
        to: profile.email,
        kind: decision.kind,
        timing,
        actionLabel: experiment.action_label || "Your focused weekly practice",
        minimumVersion: experiment.minimum_version || "Take the smallest useful step",
        deepLink: deepLink.toString(),
        idempotencyKey: key,
      });
      await admin.from("reminder_deliveries").update({
        status: result.status,
        provider_id: result.status === "accepted" ? result.providerId : null,
        attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.id);

      await recordProductEventSafely({
        event_name: result.status === "accepted" ? "reminder_sent" : "reminder_failed",
        source: "reminders",
        user_id: experiment.user_id,
        experiment_id: experiment.id,
        event_key: `${key}:${result.status}`,
      });
      if (result.status === "accepted") sent += 1;
      else countFailure(`email_${result.reason}`);
    } catch (dispatchError) {
      countFailure("dispatch_error");
      console.error("[reminders] dispatch failed", { experimentId: experiment.id, dispatchError });
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed, skipReasons, failureReasons });
}
