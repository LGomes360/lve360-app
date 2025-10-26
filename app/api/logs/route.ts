// -----------------------------------------------------------------------------
// File: app/api/logs/route.ts
// Fix: ensure log inserts use public.users.id (not auth.users.id)
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // look up user's public.users record by email
  const { data: publicUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (!publicUser?.id)
    return NextResponse.json({ error: "No matching public user record" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("logs")
    .select("*")
    .eq("user_id", publicUser.id)
    .order("log_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // get the corresponding public.users.id
  const { data: publicUser, error: lookupErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (lookupErr)
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });

  if (!publicUser?.id)
    return NextResponse.json({ error: "No matching public user found" }, { status: 400 });

  const body = await req.json();
  const payload = { ...body, user_id: publicUser.id };

  const { error } = await supabase
    .from("logs")
    .upsert(payload, { onConflict: "user_id,log_date", ignoreDuplicates: false });
  
  // --- Gamification: award XP + maintain streak ---
  try {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    // fetch current goals row
    const { data: goalsRow } = await supabaseAdmin
      .from("goals")
      .select("xp, streak_days, last_log_date, target_weight, target_sleep, target_energy")
      .eq("user_id", publicUser.id)
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
        user_id: publicUser.id,
        xp,
        streak_days: streak,
        last_log_date: today,
      }, { onConflict: "user_id" });

  } catch (e) {
    console.warn("[/api/logs] gamification update failed:", e);
  }
  // --- end gamification block ---

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
