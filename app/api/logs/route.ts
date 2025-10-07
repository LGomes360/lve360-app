// -----------------------------------------------------------------------------
// File: app/api/logs/route.ts
// LVE360 — Logs API (2025-10-07 ENHANCED)
// Handles:
//  • GET  → Fetch all logs for current user
//  • POST → Insert or update today’s log
//           + Updates XP and streak tracking in goals table
// -----------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cookies } from "next/headers";

// ─────────────────────────────────────────────────────────────
// GET: Return all logs for authenticated user
// ─────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("user_id", user.id)
    .order("log_date", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data);
}

// ─────────────────────────────────────────────────────────────
// POST: Upsert today's log and update XP/streak metrics
// ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json(); // { weight?, sleep?, energy?, notes?, log_date? }
  const payload = { ...body, user_id: user.id };

  // ─── Save or update today's log ───────────────────────────
  const { error } = await supabase
    .from("logs")
    .upsert(payload, { onConflict: "user_id,log_date" });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // ─── Update XP and streak in goals ─────────────────────────
  try {
    const userId = user.id;
    const today = new Date().toISOString().split("T")[0];

    // Get existing XP/streak
    const { data: goalRow } = await supabaseAdmin
      .from("goals")
      .select("xp, streak_days, last_log_date")
      .eq("user_id", userId)
      .maybeSingle();

    if (goalRow) {
      let newXp = (goalRow.xp ?? 0) + 10; // base XP
      let newStreak = goalRow.streak_days ?? 0;

      if (goalRow.last_log_date) {
        const last = new Date(goalRow.last_log_date);
        const diffDays = Math.floor(
          (Date.now() - last.getTime()) / 86400000
        );

        if (diffDays === 1) newStreak += 1; // continued streak
        else if (diffDays > 1) newStreak = 1; // reset
      } else {
        newStreak = 1;
      }

      // small streak bonus
      newXp += newStreak * 5;

      await supabaseAdmin
        .from("goals")
        .update({
          xp: newXp,
          streak_days: newStreak,
          last_log_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  } catch (err) {
    console.error("XP/streak update failed:", err);
  }

  return NextResponse.json({ ok: true });
}
