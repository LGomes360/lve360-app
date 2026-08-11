import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { generateAI } from "@/lib/ai/gateway";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePaidApi } from "@/lib/serverEntitlements";

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function POST() {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const admin = getSupabaseAdmin();

  try {
    const { data: userWrap, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userWrap?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const userId = userWrap.user.id;

    const { data: logs } = await admin
      .from("logs")
      .select("log_date, weight, sleep, energy, notes")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(7);

    const { data: goals } = await admin
      .from("goals")
      .select("target_weight, target_sleep, target_energy, goals, custom_goal, streak_days, xp")
      .eq("user_id", userId)
      .maybeSingle();

    const since = new Date();
    since.setDate(since.getDate() - 6);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: doseEvents } = await admin
      .from("regimen_dose_events")
      .select("status, scheduled_date")
      .eq("user_id", userId)
      .gte("scheduled_date", sinceStr);

    const totalChecks = (doseEvents ?? []).length;
    const takenChecks = (doseEvents ?? []).filter((row) => row.status === "taken").length;
    const adherence7 = pct(takenChecks, totalChecks);

    const reverseLogs = (logs ?? []).slice().reverse();
    const weights = reverseLogs
      .map((row) => (typeof row.weight === "number" ? row.weight : null))
      .filter((value): value is number => value != null);
    const sleep = reverseLogs
      .map((row) => (typeof row.sleep === "number" ? row.sleep : null))
      .filter((value): value is number => value != null);
    const energy = reverseLogs
      .map((row) => (typeof row.energy === "number" ? row.energy : null))
      .filter((value): value is number => value != null);

    const latestWeight = weights.at(-1) ?? null;
    const firstWeight = weights[0] ?? null;
    const weightDelta7 = latestWeight != null && firstWeight != null
      ? Math.round((latestWeight - firstWeight) * 10) / 10
      : null;
    const sleepAvg7 = average(sleep);
    const energyAvg7 = average(energy);
    const goalNames = Array.isArray(goals?.goals) ? goals.goals : [];
    const goalText = [
      ...goalNames,
      goals?.custom_goal ? `Custom: ${goals.custom_goal}` : null,
    ].filter(Boolean).join(", ");

    const prompt = [
      "Member weekly summary for the last 7 days.",
      `Goals: ${goalText || "Not provided"}`,
      `Targets: weight=${goals?.target_weight ?? "not provided"}, sleep=${goals?.target_sleep ?? "not provided"}/5, energy=${goals?.target_energy ?? "not provided"}/10`,
      `Recorded routine completion: ${adherence7}% (${takenChecks} taken of ${totalChecks} recorded occurrences)`,
      `Weight change: ${weightDelta7 == null ? "not recorded" : `${weightDelta7 > 0 ? "+" : ""}${weightDelta7} lb`}`,
      `Average sleep: ${sleepAvg7 == null ? "not recorded" : `${sleepAvg7.toFixed(1)} / 5`}`,
      `Average energy: ${energyAvg7 == null ? "not recorded" : `${energyAvg7.toFixed(1)} / 10`}`,
      `Recent notes: ${(logs ?? []).map((row) => row.notes).filter(Boolean).slice(0, 3).join(" | ") || "None"}`,
      "",
      "Write a concise, encouraging summary in 2 to 3 plain-English sentences and fewer than 90 words.",
      "Acknowledge one concrete signal from the data and suggest one small lifestyle action for the coming week.",
      "If recorded completion is below 60%, focus on consistency or environment design.",
      "Do not diagnose, treat, prescribe, or imply that a recorded medication or supplement should be changed.",
    ].join("\n");

    const result = await generateAI({
      task: "weekly_insight",
      userId,
      messages: [
        {
          role: "system",
          content: "You are an empathetic, factual wellness coach. Offer educational lifestyle support and avoid medical claims.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 220,
      timeoutMs: 45_000,
      temperature: 0.4,
    });

    const summary = result.text.trim() || "No summary generated.";
    const { error: insertError } = await admin.from("ai_summaries").insert({
      user_id: userId,
      summary,
    });
    if (insertError) throw insertError;

    return NextResponse.json({ ok: true, summary });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? "ai_failed" }, { status: 500 });
  }
}
