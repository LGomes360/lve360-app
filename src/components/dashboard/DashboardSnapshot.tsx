"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Section 1 — Personalized Welcome & Daily Snapshot (v3)
 * - Reads current user
 * - Fetches last 7 logs + current goals
 * - Fetches last 7 days supplement intake events → adherence %
 * - Fetches latest AI summary (ai_summaries)
 * - Computes deltas + simple "wellness score"
 * - Renders KPIs: Weight Δ, Sleep (1–5), Energy (1–10) + Adherence chip + Coaching blurb
 *
 * Tables:
 *  - public.logs(user_id, log_date, weight, sleep, energy, notes)
 *  - public.goals(user_id, target_weight, target_sleep, target_energy, goals[])
 *  - public.intake_events(user_id, item_id, intake_date, taken)
 *  - public.ai_summaries(user_id, summary, created_at)
 */

type LogRow = {
  log_date: string;
  weight: number | null;
  sleep: number | null;   // 1–5
  energy: number | null;  // 1–10
};

type GoalsRow = {
  target_weight: number | null;
  target_sleep: number | null;
  target_energy: number | null;
  goals: string[] | null;
};

type AiSummaryRow = {
  summary: string;
  created_at: string;
};

export default function DashboardSnapshot() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string>("Optimizer");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [goals, setGoals] = useState<GoalsRow | null>(null);
  const [adherence7, setAdherence7] = useState<number | null>(null);
  const [latestAi, setLatestAi] = useState<AiSummaryRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);

        // 1) Auth + friendly display name
        const { data: auth } = await supabase.auth.getUser();
        const email = auth?.user?.email ?? "optimizer@lve360.com";
        const base = email.split("@")[0];
        setUsername(base.charAt(0).toUpperCase() + base.slice(1));

        if (!auth?.user?.id) {
          setLoading(false);
          return;
        }
        const userId = auth.user.id;

        // 2) Fetch: last 7 logs (newest first)
        const { data: logRows, error: logErr } = await supabase
          .from("logs")
          .select("log_date, weight, sleep, energy")
          .eq("user_id", userId)
          .order("log_date", { ascending: false })
          .limit(7);
        if (logErr) throw logErr;
        setLogs((logRows ?? []) as LogRow[]);

        // 3) Fetch: goals (maybeSingle)
        const { data: goalRows, error: goalErr } = await supabase
          .from("goals")
          .select("target_weight, target_sleep, target_energy, goals")
          .eq("user_id", userId)
          .maybeSingle();
        if (goalErr && goalErr.details !== "The result contains 0 rows") throw goalErr;
        setGoals((goalRows ?? null) as GoalsRow | null);

        // 4) Fetch: intake events since 6 days ago → adherence %
        const since = new Date();
        since.setDate(since.getDate() - 6); // last 7 calendar days including today
        const sinceStr = since.toISOString().slice(0, 10);
        const { data: intake, error: intakeErr } = await supabase
          .from("intake_events")
          .select("taken")
          .eq("user_id", userId)
          .gte("intake_date", sinceStr);
        if (intakeErr) throw intakeErr;

        const total = (intake ?? []).length;
        const taken = (intake ?? []).filter((r: any) => r.taken).length;
        setAdherence7(total ? Math.round((taken / total) * 100) : null);

        // 5) Fetch: latest AI summary (most recent one)
        const { data: aiRows, error: aiErr } = await supabase
          .from("ai_summaries")
          .select("summary, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (aiErr) throw aiErr;
        setLatestAi(aiRows?.[0] ?? null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load your snapshot.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Derived metrics: latest log (“today”) vs. 7-day avg
  const kpis = useMemo(() => {
    if (!logs.length) {
      return {
        weightDelta: null as number | null,
        weightToday: null as number | null,
        sleepToday: null as number | null,
        energyToday: null as number | null,
        sleepAvg: null as number | null,
        energyAvg: null as number | null,
        wellnessScore: null as number | null,
      };
    }

    const today = logs[0];
    const samples = logs.filter(Boolean);

    const avg = (arr: (number | null | undefined)[]) => {
      const nums = arr
        .map((v) => (typeof v === "number" ? v : null))
        .filter((n): n is number => n != null && Number.isFinite(n));
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    };

    const weightAvg7 = avg(samples.map((r) => r.weight));
    const sleepAvg7 = avg(samples.map((r) => r.sleep));
    const energyAvg7 = avg(samples.map((r) => r.energy));

    // weight delta (today - 7-day avg)
    let weightDelta: number | null = null;
    if (typeof today.weight === "number" && typeof weightAvg7 === "number") {
      weightDelta = Math.round((today.weight - weightAvg7) * 10) / 10;
    }

    // Simple wellness score (0–100): sleep (50%) + energy (50%)
    const sleepNorm = typeof today.sleep === "number" ? (today.sleep / 5) * 100 : null;
    const energyNorm = typeof today.energy === "number" ? (today.energy / 10) * 100 : null;
    const wellnessScore =
      sleepNorm != null && energyNorm != null
        ? Math.round(sleepNorm * 0.5 + energyNorm * 0.5)
        : null;

    return {
      weightDelta,
      weightToday: today.weight ?? null,
      sleepToday: today.sleep ?? null,
      energyToday: today.energy ?? null,
      sleepAvg: sleepAvg7,
      energyAvg: energyAvg7,
      wellnessScore,
    };
  }, [logs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 bg-white/70 backdrop-blur-md rounded-2xl">
        <Loader2 className="w-5 h-5 animate-spin text-purple-600 mr-2" />
        <span className="text-gray-600">Loading your snapshot…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-[#041B2D] mb-2">👋 Good {getPartOfDay()}, {username}</h2>
        <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {error}
        </div>
      </div>
    );
  }

  const hasAnyData = logs.length > 0 || goals != null || adherence7 != null;

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      {/* Greeting + top chips */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-2">
        <h2 className="text-2xl font-bold text-[#041B2D]">
          👋 Good {getPartOfDay()}, {username}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          {kpis.wellnessScore != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1">
              Wellness: <strong className="text-[#06C1A0]">{kpis.wellnessScore}</strong>/100
            </span>
          )}
          {adherence7 != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1">
              Adherence (7d): <strong className="text-[#7C3AED]">{adherence7}%</strong>
            </span>
          )}
        </div>
      </div>

      {/* Coaching blurb from latest AI summary */}
      {latestAi?.summary && (
        <div className="mb-4 text-[15px] text-[#041B2D] bg-gradient-to-br from-purple-50 to-yellow-50 border border-purple-100 rounded-xl p-3 flex items-start gap-2">
          <Sparkles className="w-4 h-4 mt-0.5 text-[#7C3AED]" />
          <div>
            <div className="text-xs uppercase tracking-wide text-purple-600">
              Coaching tip · {new Date(latestAi.created_at).toLocaleDateString()}
            </div>
            <div className="mt-0.5">{latestAi.summary}</div>
          </div>
        </div>
      )}

      {!hasAnyData ? (
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 text-gray-700">
          No data yet — log your first day and set goals to see your snapshot come alive.
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Weight */}
            <MetricCard
              title="Weight"
              primary={kpis.weightToday != null ? `${kpis.weightToday} lb` : "—"}
              delta={kpis.weightDelta != null ? deltaLabel(kpis.weightDelta, "lb") : "—"}
              hint={goals?.target_weight != null ? `Target: ${goals.target_weight} lb` : undefined}
            />

            {/* Sleep */}
            <MetricCard
              title="Sleep"
              primary={kpis.sleepToday != null ? `${kpis.sleepToday} / 5` : "—"}
              delta={kpis.sleepAvg != null ? `7-day avg: ${round1(kpis.sleepAvg)}` : "—"}
              hint={goals?.target_sleep != null ? `Target: ${goals.target_sleep} / 5` : undefined}
            />

            {/* Energy */}
            <MetricCard
              title="Energy"
              primary={kpis.energyToday != null ? `${kpis.energyToday} / 10` : "—"}
              delta={kpis.energyAvg != null ? `7-day avg: ${round1(kpis.energyAvg)}` : "—"}
              hint={goals?.target_energy != null ? `Target: ${goals.target_energy} / 10` : undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* helpers */
function round1(n: number) { return Math.round(n * 10) / 10; }
function getPartOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
function deltaLabel(delta: number, unit: string) {
  if (delta === 0) return "No change";
  const arrow = delta > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(delta)} ${unit}`;
}

/* small KPI card */
function MetricCard({
  title, primary, delta, hint,
}: {
  title: string;
  primary: string;
  delta: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-purple-600">{title}</div>
      <div className="text-xl font-bold text-[#041B2D] mt-1">{primary}</div>
      <div className="text-sm text-gray-600 mt-0.5">{delta}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}
