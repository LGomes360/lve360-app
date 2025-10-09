"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

/**
 * Section 1 — Personalized Welcome & Daily Snapshot
 * - Reads current user
 * - Fetches last 7 logs + current goals
 * - Computes deltas + simple "wellness score"
 * - Renders 3 KPI cards: Weight Δ, Sleep (1–5), Energy (1–10)
 *
 * Tables expected:
 *   - public.logs(user_id, log_date, weight, sleep, energy, notes)
 *   - public.goals(user_id, target_weight, target_sleep, target_energy, goals[])
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

export default function DashboardSnapshot() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string>("Optimizer");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [goals, setGoals] = useState<GoalsRow | null>(null);

  // 1) get user + friendly name
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email ?? "optimizer@lve360.com";
      const base = email.split("@")[0];
      setUsername(base.charAt(0).toUpperCase() + base.slice(1));

      if (!data?.user?.id) {
        setLoading(false);
        return;
      }

      const userId = data.user.id;

      // 2) fetch last 7 logs (newest first)
      const { data: logRows, error: logErr } = await supabase
        .from("logs")
        .select("log_date, weight, sleep, energy")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(7);

      if (!logErr && logRows) setLogs(logRows as LogRow[]);

      // 3) fetch goals
      const { data: goalRows, error: goalErr } = await supabase
        .from("goals")
        .select("target_weight, target_sleep, target_energy, goals")
        .eq("user_id", userId)
        .maybeSingle();

      if (!goalErr) setGoals((goalRows ?? null) as GoalsRow | null);

      setLoading(false);
    })();
  }, [supabase]);

  // Derived metrics: last log (“today”) vs. 7-day avg
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
      const nums = arr.map(Number).filter((n) => Number.isFinite(n)) as number[];
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    };

    const weightAvg7 = avg(samples.map((r) => r.weight ?? null));
    const sleepAvg7 = avg(samples.map((r) => r.sleep ?? null));
    const energyAvg7 = avg(samples.map((r) => r.energy ?? null));

    // weight delta (today - 7-day avg)
    let weightDelta: number | null = null;
    if (typeof today.weight === "number" && typeof weightAvg7 === "number") {
      weightDelta = Math.round((today.weight - weightAvg7) * 10) / 10;
    }

    // simple wellness score (0–100), normalized components
    const sleepNorm = typeof today.sleep === "number" ? (today.sleep / 5) * 100 : null;
    const energyNorm = typeof today.energy === "number" ? (today.energy / 10) * 100 : null;
    const wellnessScore =
      sleepNorm != null && energyNorm != null
        ? Math.round((sleepNorm * 0.5 + energyNorm * 0.5))
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

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      {/* Greeting + wellness score */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
        <h2 className="text-2xl font-bold text-[#041B2D]">
          👋 Good {getPartOfDay()}, {username}
        </h2>
        {kpis.wellnessScore != null && (
          <div className="text-sm text-gray-600">
            Wellness Score:{" "}
            <span className="font-semibold text-[#06C1A0]">
              {kpis.wellnessScore}
            </span>
            /100
          </div>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Weight */}
        <MetricCard
          title="Weight"
          primary={
            kpis.weightToday != null ? `${kpis.weightToday} lb` : "—"
          }
          delta={
            kpis.weightDelta != null
              ? deltaLabel(kpis.weightDelta, "lb")
              : "—"
          }
          hint={
            goals?.target_weight != null
              ? `Target: ${goals.target_weight} lb`
              : undefined
          }
        />

        {/* Sleep */}
        <MetricCard
          title="Sleep"
          primary={
            kpis.sleepToday != null ? `${kpis.sleepToday} / 5` : "—"
          }
          delta={
            kpis.sleepAvg != null
              ? `7-day avg: ${round1(kpis.sleepAvg)}`
              : "—"
          }
          hint={
            goals?.target_sleep != null
              ? `Target: ${goals.target_sleep} / 5`
              : undefined
          }
        />

        {/* Energy */}
        <MetricCard
          title="Energy"
          primary={
            kpis.energyToday != null ? `${kpis.energyToday} / 10` : "—"
          }
          delta={
            kpis.energyAvg != null
              ? `7-day avg: ${round1(kpis.energyAvg)}`
              : "—"
          }
          hint={
            goals?.target_energy != null
              ? `Target: ${goals.target_energy} / 10`
              : undefined
          }
        />
      </div>
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
