"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, Sparkles } from "lucide-react";
import GoalsTargetsEditor from "./GoalsTargetsEditor";

/**
 * DashboardSnapshot — Greeting & Daily Snapshot
 * Reads: logs (last 7), goals, intake_events (7d adherence), latest ai_summaries
 * Shows: greeting, wellness score, adherence chip, AI coaching blurb,
 *        KPIs (Weight, Sleep, Energy) + deltas vs yesterday / 7d avg.
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
  const [showTargets, setShowTargets] = useState(false);

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

        // Fetch in parallel for snappier load
        const since = new Date();
        since.setDate(since.getDate() - 6);
        const sinceStr = since.toISOString().slice(0, 10);

        const [
          logsQ,
          goalsQ,
          aiQ,
        ] = await Promise.all([
          supabase
            .from("logs")
            .select("log_date, weight, sleep, energy")
            .eq("user_id", userId)
            .order("log_date", { ascending: false })
            .limit(7),
          supabase
            .from("goals")
            .select("target_weight, target_sleep, target_energy, goals")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("ai_summaries")
            .select("summary, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        if (logsQ.error) throw logsQ.error;
        setLogs((logsQ.data ?? []) as LogRow[]);

        if (goalsQ.error && goalsQ.error.details !== "The result contains 0 rows") {
          throw goalsQ.error;
        }
        setGoals((goalsQ.data ?? null) as GoalsRow | null);

        if (aiQ.error) throw aiQ.error;
        setLatestAi(aiQ.data?.[0] ?? null);

        // 7-day adherence (defensive: intake_events may be absent / RLS)
        try {
          const intakeQ = await supabase
            .from("intake_events")
            .select("taken")
            .eq("user_id", userId)
            .gte("intake_date", sinceStr);

          const total = (intakeQ.data ?? []).length;
          const taken = (intakeQ.data ?? []).filter((r: any) => r.taken).length;
          setAdherence7(total ? Math.round((taken / total) * 100) : null);
        } catch {
          setAdherence7(null);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load your snapshot.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Derived metrics & deltas
  const kpis = useMemo(() => {
    const clamp = (v: number | null, min: number, max: number) =>
      typeof v === "number" ? Math.max(min, Math.min(max, v)) : null;

    if (!logs.length) {
      return {
        weightDeltaDay: null as number | null,
        weightDeltaAvg: null as number | null,
        weightToday: null as number | null,

        sleepToday: null as number | null,
        sleepAvg: null as number | null,
        sleepDeltaDay: null as number | null,

        energyToday: null as number | null,
        energyAvg: null as number | null,
        energyDeltaDay: null as number | null,

        wellnessScore: null as number | null,
      };
    }

    // newest first (we fetched desc)
    const today = logs[0];
    const yesterday = logs[1] ?? null;

    const avg = (arr: (number | null | undefined)[]) => {
      const nums = arr
        .map((v) => (typeof v === "number" ? v : null))
        .filter((n): n is number => n != null && Number.isFinite(n));
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    };

    const weightAvg7 = avg(logs.map((r) => r.weight));
    const sleepAvg7 = avg(logs.map((r) => r.sleep));
    const energyAvg7 = avg(logs.map((r) => r.energy));

    const weightToday = today.weight ?? null;
    const sleepToday = clamp(today.sleep ?? null, 1, 5);
    const energyToday = clamp(today.energy ?? null, 1, 10);

    // deltas vs yesterday
    const weightDeltaDay =
      typeof today.weight === "number" && typeof yesterday?.weight === "number"
        ? round1(today.weight - yesterday.weight)
        : null;

    const sleepDeltaDay =
      typeof today.sleep === "number" && typeof yesterday?.sleep === "number"
        ? round1(today.sleep - yesterday.sleep)
        : null;

    const energyDeltaDay =
      typeof today.energy === "number" && typeof yesterday?.energy === "number"
        ? round1(today.energy - yesterday.energy)
        : null;

    // delta vs 7-day avg (weight only for now)
    const weightDeltaAvg =
      typeof today.weight === "number" && typeof weightAvg7 === "number"
        ? round1(today.weight - weightAvg7)
        : null;

    // Simple wellness score (0–100): sleep (50%) + energy (50%)
    const sleepNorm = typeof sleepToday === "number" ? (sleepToday / 5) * 100 : null;
    const energyNorm = typeof energyToday === "number" ? (energyToday / 10) * 100 : null;
    const wellnessScore =
      sleepNorm != null && energyNorm != null
        ? Math.round(sleepNorm * 0.5 + energyNorm * 0.5)
        : null;

    return {
      weightDeltaDay,
      weightDeltaAvg,
      weightToday,

      sleepToday,
      sleepAvg: sleepAvg7,
      sleepDeltaDay,

      energyToday,
      energyAvg: energyAvg7,
      energyDeltaDay,

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
      {/* Greeting + chips + quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
        <div>
          <h2 className="text-2xl font-bold text-[#041B2D]">
            👋 Good {getPartOfDay()}, {username}
          </h2>
          {/* yesterday summary row */}
          {logs.length > 1 && (
            <div className="text-sm text-gray-700 mt-1">
              <Delta label="Sleep" delta={kpis.sleepDeltaDay} unit="" goodUp />
              <span className="mx-2">•</span>
              <Delta label="Energy" delta={kpis.energyDeltaDay} unit="" goodUp />
              <span className="mx-2">•</span>
              <Delta label="Weight" delta={kpis.weightDeltaDay} unit="lb" goodUp={false} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
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
          {/* Quick actions */}
          <a
            href="#daily-log"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
            aria-label="Log today"
            title="Log today"
          >
            Log today
          </a>
          <a
            href="#todays-plan"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
            aria-label="Open Today’s Plan"
            title="Open Today’s Plan"
          >
            Today’s plan
          </a>
          {/* Edit targets toggle */}
          <button
            onClick={() => setShowTargets(true)}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
            aria-label="Edit targets"
            title="Edit targets"
          >
            Edit targets
          </button>
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

      {/* Main conditional: empty state vs KPI grid */}
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
              delta={
                kpis.weightDeltaAvg != null
                  ? `${
                      kpis.weightDeltaAvg === 0
                        ? "No change"
                        : (kpis.weightDeltaAvg > 0 ? "▲" : "▼") +
                          " " +
                          Math.abs(kpis.weightDeltaAvg) +
                          " lb vs 7d avg"
                    }`
                  : "—"
              }
              hint={goals?.target_weight != null ? `Target: ${goals.target_weight} lb` : undefined}
            />

            {/* Sleep */}
            <MetricCard
              title="Sleep"
              primary={kpis.sleepToday != null ? `${kpis.sleepToday} / 5` : "—"}
              delta={kpis.sleepAvg != null ? `7-day avg: ${round1(kpis.sleepAvg)}` : "—"}
              hint={sleepTargetHint(goals?.target_sleep)}
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

      {/* Modal: Edit targets */}
      {showTargets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-[#041B2D]">Edit your targets</div>
              <button
                onClick={() => setShowTargets(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <GoalsTargetsEditor
              targetWeight={goals?.target_weight ?? null}
              targetSleep={goals?.target_sleep ?? null}
              targetEnergy={goals?.target_energy ?? null}
              onSaved={(v) => {
                setGoals((g) => ({
                  ...(g ?? { goals: [] as string[] | null }),
                  target_weight: v.weight,
                  target_sleep: v.sleep,
                  target_energy: v.energy,
                }));
                setShowTargets(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

/* helpers */
function sleepTargetHint(n: number | null | undefined) {
  if (n == null) return undefined;
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  // If user saved hours (typical: 6–10), show "hrs". If they saved a 0–5 score, keep "/ 5".
  return v > 5 ? `Target: ${v} hrs` : `Target: ${v} / 5`;
}
function round1(n: number) { return Math.round(n * 10) / 10; }
function getPartOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
function signArrow(n: number) {
  if (n === 0) return "↔";
  return n > 0 ? "▲" : "▼";
}
function cls(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

/** delta chip for snapshot header */
function Delta({
  label, delta, unit, goodUp,
}: { label: string; delta: number | null; unit: string; goodUp: boolean }) {
  if (delta == null) return <span className="text-gray-500">{label}: —</span>;
  const arrow = signArrow(delta);
  const isUp = delta > 0;
  const good = goodUp ? isUp : !isUp; // e.g., Sleep ↑ is good; Weight ↑ usually not
  return (
    <span
      className={cls(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        good ? "bg-teal-50 border-teal-200 text-teal-800" : "bg-rose-50 border-rose-200 text-rose-800"
      )}
      title={`${label} ${arrow} ${Math.abs(delta)}${unit ? " " + unit : ""} vs yesterday`}
    >
      <span className="text-xs">{label} {arrow} {Math.abs(delta)}{unit ? ` ${unit}` : ""}</span>
    </span>
  );
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
