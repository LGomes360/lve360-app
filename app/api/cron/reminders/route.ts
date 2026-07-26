import { NextResponse, type NextRequest } from "next/server";

import { recordProductEventSafely } from "@/lib/productAnalytics";
import {
  addDays,
  decideReminder,
  reminderIdempotencyKey,
  sendReminderEmail,
} from "@/lib/reminders";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExperimentRow = {
  id: string;
  user_id: string;
  week_start: string;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: experiments, error } = await admin
    .from("weekly_experiments")
    .select("id, user_id, week_start")
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

  for (const experiment of (experiments ?? []) as ExperimentRow[]) {
    try {
      const [{ data: preference }, { data: profile }] = await Promise.all([
        admin
          .from("user_preferences")
          .select("reminder_preference, timezone, cue_hour, quiet_start_hour, quiet_end_hour")
          .eq("user_id", experiment.user_id)
          .maybeSingle(),
        admin.from("users").select("email, tier").eq("id", experiment.user_id).maybeSingle(),
      ]);
      if (
        preference?.reminder_preference !== "email"
        || !profile?.email
        || (profile.tier !== "premium" && profile.tier !== "trial")
      ) {
        skipped += 1;
        continue;
      }

      const weekEnd = addDays(experiment.week_start, 6);
      const [{ data: completions }, { data: review }] = await Promise.all([
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

      const decision = decideReminder({
        now,
        timezone: preference.timezone,
        cueHour: preference.cue_hour,
        quietStartHour: preference.quiet_start_hour,
        quietEndHour: preference.quiet_end_hour,
        weekStart: experiment.week_start,
        completedDates: (completions ?? []).map((item) => item.completion_date),
        reviewCompleted: review?.status === "completed",
      });
      if (!decision) {
        skipped += 1;
        continue;
      }

      const key = reminderIdempotencyKey(decision.kind, experiment.id, decision.localDate);
      const { data: delivery, error: claimError } = await admin
        .from("reminder_deliveries")
        .insert({
          user_id: experiment.user_id,
          experiment_id: experiment.id,
          reminder_kind: decision.kind,
          local_date: decision.localDate,
          idempotency_key: key,
        })
        .select("id")
        .single();
      if (claimError?.code === "23505") {
        skipped += 1;
        continue;
      }
      if (claimError || !delivery) throw claimError ?? new Error("delivery_claim_failed");

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://lve360.com").replace(/\/$/, "");
      const path = decision.kind === "weekly_review"
        ? `/review?experiment=${encodeURIComponent(experiment.id)}&source=reminder`
        : `/today?experiment=${encodeURIComponent(experiment.id)}&source=reminder`;
      const result = await sendReminderEmail({
        to: profile.email,
        kind: decision.kind,
        deepLink: `${appUrl}${path}`,
        idempotencyKey: key,
      });
      await admin.from("reminder_deliveries").update({
        status: result.status,
        provider_id: result.status === "sent" ? result.providerId : null,
        attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.id);

      await recordProductEventSafely({
        event_name: result.status === "sent" ? "reminder_sent" : "reminder_failed",
        source: "reminders",
        user_id: experiment.user_id,
        experiment_id: experiment.id,
        event_key: `${key}:${result.status}`,
      });
      if (result.status === "sent") sent += 1;
      else failed += 1;
    } catch (dispatchError) {
      failed += 1;
      console.error("[reminders] dispatch failed", { experimentId: experiment.id, dispatchError });
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed });
}
