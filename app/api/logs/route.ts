// -----------------------------------------------------------------------------
// File: app/api/logs/route.ts
// Daily logs use the canonical signed-in user id shared by the paid dashboard.
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordProductEventSafely } from "@/lib/productAnalytics";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { parseLocalDate } from "@/lib/today";

export async function GET(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;
  const userId = entitlement.user.id;

  const requestedDate = new URL(req.url).searchParams.get("date");
  if (requestedDate != null) {
    const localDate = parseLocalDate(requestedDate);
    if (!localDate) {
      return NextResponse.json({ error: "Invalid local date" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("logs")
      .select("weight,sleep,energy,notes,log_date")
      .eq("user_id", userId)
      .eq("log_date", localDate)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, log: data ?? null });
  }

  const { data, error } = await supabaseAdmin
    .from("logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;
  const userId = entitlement.user.id;

  const body = await req.json();
  const payload = { ...body, user_id: userId };

  const { error } = await supabaseAdmin
    .from("logs")
    .upsert(payload, { onConflict: "user_id,log_date", ignoreDuplicates: false });
  
  // --- Gamification: award XP + maintain streak ---
  try {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    // fetch current goals row
    const { data: goalsRow } = await supabaseAdmin
      .from("goals")
      .select("xp, streak_days, last_log_date, target_weight, target_sleep, target_energy")
      .eq("user_id", userId)
      .maybeSingle();

    // base XP for logging today
    let xp = (goalsRow?.xp ?? 0) + 10;

    // streak calc
    const last = goalsRow?.last_log_date ? new Date(goalsRow.last_log_date) : null;
    const lastStr = goalsRow?.last_log_date ?? null;
    let streak = goalsRow?.streak_days ?? 0;

    if (!lastStr) {
      streak = 1;
    } else {
      const dToday = new Date(today);
      const ms = dToday.getTime() - new Date(lastStr).getTime();
      const days = Math.round(ms / 86400000);
      if (days === 0) {
        // already logged today: keep streak
      } else if (days === 1) {
        streak = streak + 1;
        xp += 5; // small bonus for consecutive day
      } else {
        streak = 1; // reset
      }
    }

    // optional: quick target-hit bonus
    // (example: if energy >= target today you could bonus XP; keep simple for now)

    await supabaseAdmin
      .from("goals")
      .upsert({
        user_id: userId,
        xp,
        streak_days: streak,
        last_log_date: today,
      }, { onConflict: "user_id" });

  } catch (e) {
    console.warn("[/api/logs] gamification update failed:", e);
  }
  // --- end gamification block ---

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const logDate = typeof body?.log_date === "string" ? body.log_date.slice(0, 10) : "unknown";
  await recordProductEventSafely({
    event_name: "check_in_completed",
    source: "daily_log",
    user_id: userId,
    event_key: `checkin:${userId}:${logDate}`,
  });

  return NextResponse.json({ ok: true });
}
