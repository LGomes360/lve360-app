import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  isReminderPreference,
  isWeightUnit,
  normalizePreferredName,
} from "@/lib/accountSettings";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [{ data: profile, error: profileError }, { data: preferences, error: preferencesError }] = await Promise.all([
    supabase
    .from("users")
    .select("email, tier, billing_interval, subscription_end_date")
    .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_preferences")
      .select("preferred_name, weight_unit, reminder_preference")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (profileError || preferencesError) {
    console.error("[account] load failed", profileError?.message ?? preferencesError?.message);
    return NextResponse.json({ ok: false, error: "account_unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    account: {
      email: profile?.email ?? user.email,
      tier: profile?.tier ?? "free",
      billing_interval: profile?.billing_interval ?? null,
      subscription_end_date: profile?.subscription_end_date ?? null,
      preferred_name: preferences?.preferred_name ?? "",
      weight_unit: preferences?.weight_unit === "kg" ? "kg" : "lb",
      reminder_preference: preferences?.reminder_preference === "email" ? "email" : "none",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const preferredName = normalizePreferredName(body?.preferred_name);
  if (preferredName === undefined || !isWeightUnit(body?.weight_unit) || !isReminderPreference(body?.reminder_preference)) {
    return NextResponse.json({ ok: false, error: "invalid_preferences" }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    preferred_name: preferredName,
    weight_unit: body.weight_unit,
    reminder_preference: body.reminder_preference,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("[account] save failed", error.message);
    return NextResponse.json({ ok: false, error: "preferences_unavailable" }, { status: 500 });
  }

  const { error: experimentError } = await supabase
    .from("weekly_experiments")
    .update({ reminder_preference: body.reminder_preference, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("status", ["draft", "active"]);
  if (experimentError) {
    console.error("[account] reminder sync failed", experimentError.message);
    return NextResponse.json({ ok: false, error: "preferences_unavailable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferences: payload });
}
