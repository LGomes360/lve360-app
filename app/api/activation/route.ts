import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  cleanText,
  isIdentityDirection,
  isReadyToActivate,
  isSafeLifestyleAction,
  type IdentityDirection,
  type WeeklyExperiment,
} from "@/lib/activation";
import { resolveBlueprintActionFromRequest } from "@/lib/blueprintActionHandoff";
import { isHour, isIanaTimeZone } from "@/lib/accountSettings";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { recordProductEventSafely } from "@/lib/productAnalytics";
import { isQuietHour, isReminderTiming } from "@/lib/reminderSchedule";
import {
  connectionType,
  practiceGoalOptions,
  type PracticeGoalOption,
  type PracticeGoalRow,
} from "@/lib/practiceConnection";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ActivationBody = {
  step?: number;
  identity_direction?: unknown;
  action_label?: unknown;
  cue?: unknown;
  frequency_per_week?: unknown;
  minimum_version?: unknown;
  reminder_preference?: unknown;
  reminder_timing?: unknown;
  reminder_hour?: unknown;
  timezone?: unknown;
  cue_hour?: unknown;
  goal_key?: unknown;
};

function identityFromCategory(category: string): IdentityDirection {
  if (["movement", "nutrition", "sleep", "relationships", "focus"].includes(category)) {
    return category as IdentityDirection;
  }
  return category === "mindset" ? "emotional_health" : "overall_health";
}

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

async function currentExperiment(userId: string): Promise<WeeklyExperiment | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("weekly_experiments")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["draft", "active"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WeeklyExperiment | null) ?? null;
}

async function createDraft(req: NextRequest, userId: string): Promise<WeeklyExperiment> {
  const handoff = await resolveBlueprintActionFromRequest(req);
  const selected = handoff?.selected.kind === "lifestyle" ? handoff.selected : null;
  const hasSpecificAction = selected?.source === "report";
  const payload = {
    user_id: userId,
    source_stack_id: hasSpecificAction ? handoff?.pointer.stackId ?? null : null,
    source_action_id: hasSpecificAction ? handoff?.pointer.actionId ?? null : null,
    connection_type: hasSpecificAction ? "blueprint" : "independent",
    identity_direction: selected ? identityFromCategory(selected.category) : null,
    action_label: hasSpecificAction ? selected?.label ?? null : null,
    onboarding_step: 0,
    status: "draft",
  };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("weekly_experiments").insert(payload).select("*").single();
  if (error) throw error;
  await admin.from("activation_events").insert({
    user_id: userId,
    experiment_id: data.id,
    event_name: "activation_started",
    step: 0,
    metadata: { source: hasSpecificAction ? "blueprint" : "dashboard" },
  });
  await recordProductEventSafely({
    event_name: "activation_started",
    source: "onboarding",
    user_id: userId,
    experiment_id: data.id,
    step: 0,
    event_key: `activation:started:${data.id}`,
  });
  return data as WeeklyExperiment;
}

async function loadGoalOptions(userId: string): Promise<{ row: PracticeGoalRow | null; options: PracticeGoalOption[] }> {
  const { data, error } = await getSupabaseAdmin()
    .from("goals")
    .select("id,goals,custom_goal,target_weight,target_sleep,target_energy")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = (data as PracticeGoalRow | null) ?? null;
  return { row, options: practiceGoalOptions(row) };
}

async function getOrCreateExperiment(req: NextRequest, userId: string): Promise<WeeklyExperiment> {
  const current = await currentExperiment(userId);
  if (current) return current;
  try {
    return await createDraft(req, userId);
  } catch (error) {
    const createdByAnotherRequest = await currentExperiment(userId);
    if (createdByAnotherRequest) return createdByAnotherRequest;
    throw error;
  }
}

function responseForAuthError(error: "unauthorized" | "premium_required") {
  return NextResponse.json({ ok: false, error }, { status: error === "unauthorized" ? 401 : 403 });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return responseForAuthError(auth.error ?? "unauthorized");
    const [experiment, { data: preferences, error: preferencesError }, goals] = await Promise.all([
      getOrCreateExperiment(req, auth.user.id),
      getSupabaseAdmin()
        .from("user_preferences")
        .select("timezone, quiet_start_hour, quiet_end_hour")
        .eq("user_id", auth.user.id)
        .maybeSingle(),
      loadGoalOptions(auth.user.id),
    ]);
    if (preferencesError) throw preferencesError;
    return NextResponse.json({
      ok: true,
      experiment,
      reminder_context: {
        timezone: preferences?.timezone ?? "UTC",
        quiet_start_hour: preferences?.quiet_start_hour ?? 21,
        quiet_end_hour: preferences?.quiet_end_hour ?? 7,
      },
      goal_options: goals.options,
    });
  } catch (error) {
    console.error("[activation] load failed", error);
    return NextResponse.json({ ok: false, error: "activation_unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePaidUser();
    if (auth.error || !auth.user) return responseForAuthError(auth.error ?? "unauthorized");
    const body = (await req.json().catch(() => null)) as ActivationBody | null;
    const step = Number(body?.step);
    if (!Number.isInteger(step) || step < 1 || step > 6) {
      return NextResponse.json({ ok: false, error: "invalid_step" }, { status: 400 });
    }

    const experiment = await getOrCreateExperiment(req, auth.user.id);
    if (experiment.status === "active" && step === 6) {
      return NextResponse.json({ ok: true, experiment });
    }

    const changes: Record<string, unknown> = {
      onboarding_step: Math.max(experiment.onboarding_step, step),
      updated_at: new Date().toISOString(),
    };

    if (step === 1) {
      if (!isIdentityDirection(body?.identity_direction)) {
        return NextResponse.json({ ok: false, error: "choose_identity" }, { status: 400 });
      }
      changes.identity_direction = body.identity_direction;
    }

    if (step === 2) {
      const action = cleanText(body?.action_label, 240);
      if (!isSafeLifestyleAction(action)) {
        return NextResponse.json({ ok: false, error: "choose_safe_lifestyle_action" }, { status: 400 });
      }
      changes.action_label = action;
      const actionChanged = action !== experiment.action_label;
      const keepsBlueprint = !actionChanged && Boolean(experiment.source_stack_id && experiment.source_action_id);
      if (actionChanged) {
        changes.source_stack_id = null;
        changes.source_action_id = null;
      }
      const goals = await loadGoalOptions(auth.user.id);
      const goalKey = typeof body?.goal_key === "string" ? cleanText(body.goal_key, 120) : null;
      const selectedGoal = goalKey ? goals.options.find((option) => option.key === goalKey) ?? null : null;
      if (goalKey && (!goals.row || !selectedGoal)) {
        return NextResponse.json({ ok: false, error: "choose_current_goal" }, { status: 400 });
      }
      changes.goal_id = selectedGoal ? goals.row?.id ?? null : null;
      changes.goal_key = selectedGoal?.key ?? null;
      changes.goal_label_snapshot = selectedGoal?.label ?? null;
      changes.connection_type = connectionType(Boolean(selectedGoal), keepsBlueprint);
    }

    if (step === 3) {
      const cue = cleanText(body?.cue, 160);
      const frequency = Number(body?.frequency_per_week);
      if (!cue || cue.length < 2 || !Number.isInteger(frequency) || frequency < 1 || frequency > 7) {
        return NextResponse.json({ ok: false, error: "add_cue_and_frequency" }, { status: 400 });
      }
      changes.cue = cue;
      changes.frequency_per_week = frequency;
    }

    if (step === 4) {
      const minimum = cleanText(body?.minimum_version, 160);
      if (!minimum || minimum.length < 2 || !isSafeLifestyleAction(minimum)) {
        return NextResponse.json({ ok: false, error: "add_safe_minimum_version" }, { status: 400 });
      }
      changes.minimum_version = minimum;
    }

    if (step === 5) {
      if (body?.reminder_preference !== "none" && body?.reminder_preference !== "email") {
        return NextResponse.json({ ok: false, error: "choose_reminder_preference" }, { status: 400 });
      }
      if (!isReminderTiming(body.reminder_timing)) {
        return NextResponse.json({ ok: false, error: "choose_reminder_timing" }, { status: 400 });
      }
      const usesPracticeHour = body.reminder_preference === "email" && body.reminder_timing !== "account_default";
      if (
        body.reminder_preference === "email"
        && (!isIanaTimeZone(body.timezone) || (usesPracticeHour && !isHour(body.reminder_hour)))
      ) {
        return NextResponse.json({ ok: false, error: "choose_reminder_time" }, { status: 400 });
      }
      if (usesPracticeHour) {
        const { data: preferences, error: preferencesError } = await getSupabaseAdmin()
          .from("user_preferences")
          .select("quiet_start_hour, quiet_end_hour")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (preferencesError) throw preferencesError;
        const quietStartHour = preferences?.quiet_start_hour ?? 21;
        const quietEndHour = preferences?.quiet_end_hour ?? 7;
        if (isQuietHour(Number(body.reminder_hour), quietStartHour, quietEndHour)) {
          return NextResponse.json({ ok: false, error: "reminder_in_quiet_hours" }, { status: 400 });
        }
      }
      changes.reminder_preference = body.reminder_preference;
      changes.reminder_timing = body.reminder_timing;
      changes.reminder_hour = usesPracticeHour ? body.reminder_hour : null;
    }

    if (step === 6) {
      if (!isReadyToActivate(experiment)) {
        return NextResponse.json({ ok: false, error: "complete_required_steps" }, { status: 409 });
      }
      changes.status = "active";
      changes.activated_at = new Date().toISOString();
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("weekly_experiments")
      .update(changes)
      .eq("id", experiment.id)
      .eq("user_id", auth.user.id)
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("activation_events").insert({
      user_id: auth.user.id,
      experiment_id: experiment.id,
      event_name: step === 6 ? "activation_completed" : "step_completed",
      step,
      metadata: {},
    });

    if (step === 6) {
      await recordProductEventSafely({
        event_name: "activation_completed",
        source: "onboarding",
        user_id: auth.user.id,
        experiment_id: experiment.id,
        step: 6,
        event_key: `activation:completed:${experiment.id}`,
      });
    }

    if (step === 5) {
      const { error: preferenceError } = await admin.from("user_preferences").upsert(
        {
          user_id: auth.user.id,
          reminder_preference: body?.reminder_preference,
          ...(body?.reminder_preference === "email" ? {
            timezone: body.timezone,
          } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (preferenceError) throw preferenceError;
    }

    return NextResponse.json({ ok: true, experiment: data });
  } catch (error) {
    console.error("[activation] save failed", error);
    return NextResponse.json({ ok: false, error: "activation_unavailable" }, { status: 500 });
  }
}
