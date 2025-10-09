// app/api/ai-insights/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

// If you already have a helper in src/lib/openai.ts, you can import it instead.
// import { openai } from "@/lib/openai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// Small helper to compute a % (0–100) safely
function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function POST() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1) Auth
    const { data: userWrap, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userWrap?.user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const userId = userWrap.user.id;

    // 2) Pull last 7 days logs (descending so [0] is latest)
    const { data: logs } = await admin
      .from("logs")
      .select("log_date, weight, sleep, energy, notes")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(7);

    // 3) Pull goals (maybeSingle)
    const { data: goals } = await admin
      .from("goals")
      .select("target_weight, target_sleep, target_energy, goals, custom_goal, streak_days, xp")
      .eq("user_id", userId)
      .maybeSingle();

    // 4) Compute 7-day adherence from intake_events (count of taken vs total items * days present)
    //    We'll count distinct item checks for the last 7 days.
    const since = new Date();
    since.setDate(since.getDate() - 6); // includes today
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: intake } = await admin
      .from("intake_events")
      .select("item_id, intake_date, taken")
      .eq("user_id", userId)
      .gte("intake_date", sinceStr);

    const totalChecks = (intake ?? []).length;
    const takenChecks = (intake ?? []).filter((r) => r.taken).length;
    const adherence7 = pct(takenChecks, totalChecks);

    // 5) Some simple aggregates for the prompt
    const reverseLogs = (logs ?? []).slice().reverse(); // oldest → newest
    const w = reverseLogs.map((r) => (typeof r.weight === "number" ? r.weight : null)).filter((x) => x != null) as number[];
    const s = reverseLogs.map((r) => (typeof r.sleep === "number" ? r.sleep : null)).filter((x) => x != null) as number[];
    const e = reverseLogs.map((r) => (typeof r.energy === "number" ? r.energy : null)).filter((x) => x != null) as number[];

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const weightLatest = w.length ? w[w.length - 1] : null;
    const weightFirst = w.length ? w[0] : null;
    const weightDelta7 = weightLatest != null && weightFirst != null ? Math.round((weightLatest - weightFirst) * 10) / 10 : null;
    const sleepAvg7 = avg(s);
    const energyAvg7 = avg(e);

    // 6) Compose an AI prompt
    const goalNames = Array.isArray(goals?.goals) ? goals?.goals : [];
    const goalText = [
      ...(goalNames ?? []),
      goals?.custom_goal ? `Custom: ${goals.custom_goal}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const lines = [
      `User weekly summary (last 7 days).`,
      `Goals: ${goalText || "—"}`,
      `Targets: weight=${goals?.target_weight ?? "—"}, sleep=${goals?.target_sleep ?? "—"}/5, energy=${goals?.target_energy ?? "—"}/10`,
      `Adherence (supplements): ${adherence7}%`,
      `Weight delta 7d: ${weightDelta7 == null ? "—" : (weightDelta7 > 0 ? `+${weightDelta7}` : `${weightDelta7}`)} lb`,
      `Sleep avg 7d: ${sleepAvg7 == null ? "—" : sleepAvg7.toFixed(1)} / 5`,
      `Energy avg 7d: ${energyAvg7 == null ? "—" : energyAvg7.toFixed(1)} / 10`,
      `Notes (most recent first): ${(logs ?? []).map(l => l.notes).filter(Boolean).slice(0,3).join(" | ") || "—"}`,
      ``,
      `Write a concise, encouraging summary (2–3 sentences) in plain English.`,
      `1) Acknowledge progress (weight/sleep/energy/adherence).`,
      `2) Give 1 actionable suggestion for the coming week.`,
      `3) If adherence < 60%, focus tip on consistency and timing.`,
      `Avoid medical claims; use coaching tone; <90 words.`,
    ].join("\n");

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an empathetic, factual health coach. Avoid medical claims; offer practical, supplement- and habit-focused tips." },
        { role: "user", content: lines },
      ],
      temperature: 0.4,
      max_tokens: 220,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "No summary generated.";

    // 7) Store in ai_summaries
    const { error: insErr } = await admin.from("ai_summaries").insert({
      user_id: userId,
      summary: text,
    });
    if (insErr) throw insErr;

    return NextResponse.json({ ok: true, summary: text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "ai_failed" }, { status: 500 });
  }
}
