"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

/**
 * ProgressTracker.tsx — Premium micro-viz (single-pass)
 * What’s included:
 * 1) Weight delta vs 30d baseline (+ lb/kg toggle w/ localStorage)
 * 2) Sleep/Energy 7d averages + week-over-week deltas
 * 3) Goal band overlay behind sparklines (if target set)
 * 4) Smoothed area-sparklines (Catmull–Rom → Bezier), min/max/last dots + <title> tooltips
 * 5) Responsive, clipped to rounded cards (no bleeding)
 * 6) Graceful low-data states (<4 points)
 * 7) A11y labels/titles
 * 8) Premium gating for advanced overlays based on users.tier
 * 9) Same DB access pattern; optional index noted below
 * 10) Small perf touches (memoization, minimal recompute)
 *
 * Tables used:
 *  - public.logs(user_id, log_date, weight, sleep, energy)
 *  - public.goals(user_id, target_weight, target_sleep, target_energy)
 *  - public.users(id, tier)
 *
 * Optional DB index (run once in Supabase if desired):
 *   create index if not exists logs_user_date_idx on public.logs(user_id, log_date);
 */

type LogRow = {
  log_date: string;         // ISO date
  weight: number | null;    // in pounds
  sleep: number | null;     // 1–5
  energy: number | null;    // 1–10
};

type GoalsRow = {
  target_weight: number | null;
  target_sleep: number | null;
  target_energy: number | null;
};

type TierRow = { tier: string };

const KG_PER_LB = 0.45359237;
const UNIT_KEY = "lve360_weight_unit"; // "lb" | "kg"

export default function ProgressTracker() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [goals, setGoals] = useState<GoalsRow | null>(null);
  const [tier, setTier] = useState<string>("free"); // default to free

  // weight unit toggle (lb/kg), stored locally
  const [weightUnit, setWeightUnit] = useState<"lb" | "kg">(
    (typeof window !== "undefined" && (localStorage.getItem(UNIT_KEY) as "lb" | "kg")) || "lb"
  );
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(UNIT_KEY, weightUnit);
  }, [weightUnit]);

  useEffect(() => {
    (async () => {
      const { data: userWrap } = await supabase.auth.getUser();
      const userId = userWrap?.user?.id;
      if (!userId) { setLoading(false); return; }

      // Pull last 30 days, ascending for neat charts
      const { data: logRows } = await supabase
        .from("logs")
        .select("log_date, weight, sleep, energy")
        .eq("user_id", userId)
        .order("log_date", { ascending: true })
        .limit(30);

      setLogs((logRows ?? []) as LogRow[]);

      const { data: g } = await supabase
        .from("goals")
        .select("target_weight, target_sleep, target_energy")
        .eq("user_id", userId)
        .maybeSingle();
      setGoals((g ?? null) as GoalsRow | null);

      const { data: u } = await supabase
        .from("users")
        .select("tier")
        .eq("id", userId)
        .maybeSingle();
      setTier((u?.tier || "free") as string);

      setLoading(false);
    })();
  }, [supabase]);

  // ---- Helpers
  const toNums = (arr: (number | null | undefined)[]) =>
    arr.map((v) => (typeof v === "number" ? v : null));
  const last = <T,>(arr: T[]) => (arr.length ? arr[arr.length - 1] : undefined);
  const avg = (arr: (number | null)[]) => {
    const nums = arr.filter((n): n is number => n != null && Number.isFinite(n));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };
  const sliceLast = <T,>(rows: T[], n: number) => rows.slice(Math.max(0, rows.length - n));

  // ---- Build arrays
  const weightValsRaw = useMemo(() => toNums(logs.map((l) => l.weight)), [logs]);
  const sleepVals  = useMemo(() => toNums(logs.map((l) => l.sleep)), [logs]);
  const energyVals = useMemo(() => toNums(logs.map((l) => l.energy)), [logs]);

  // unit conversion for display
  const weightVals = useMemo(() => {
    if (weightUnit === "lb") return weightValsRaw;
    // convert lb → kg (1 lb = 0.45359237 kg)
    return weightValsRaw.map((v) => (v == null ? null : round1(v * KG_PER_LB)));
  }, [weightValsRaw, weightUnit]);

  // ---- Basic metrics
  const weightToday = useMemo(() => last(weightVals) ?? null, [weightVals]);

  // baseline and delta vs 30-day start (weight)
  const weightBaseline = useMemo(() => {
    const first = weightVals.find((v) => v != null) ?? null;
    return first;
  }, [weightVals]);

  const weightDelta = useMemo(() => {
    if (weightToday == null || weightBaseline == null) return null;
    return round1(weightToday - weightBaseline);
  }, [weightToday, weightBaseline]);

  // 7-day averages
  const sleep7 = useMemo(
    () => avg(toNums(sliceLast(logs, 7).map((l) => l.sleep))),
    [logs]
  );
  const energy7 = useMemo(
    () => avg(toNums(sliceLast(logs, 7).map((l) => l.energy))),
    [logs]
  );

  // Week-over-week deltas (current last 7 vs previous 7)
  const sleepWoW = useMemo(() => {
    const last14 = sliceLast(logs, 14);
    const first7 = last14.slice(0, Math.max(0, last14.length - 7));
    const last7 = sliceLast(last14, 7);
    const a = avg(toNums(first7.map((l) => l.sleep)));
    const b = avg(toNums(last7.map((l) => l.sleep)));
    if (a == null || b == null) return null;
    return round1(b - a);
  }, [logs]);

  const energyWoW = useMemo(() => {
    const last14 = sliceLast(logs, 14);
    const first7 = last14.slice(0, Math.max(0, last14.length - 7));
    const last7 = sliceLast(last14, 7);
    const a = avg(toNums(first7.map((l) => l.energy)));
    const b = avg(toNums(last7.map((l) => l.energy)));
    if (a == null || b == null) return null;
    return round1(b - a);
  }, [logs]);

  // ---- Sparkline point builder (scaled to 0..h)
  function sparkPoints(values: (number | null)[], width = 220, height = 64) {
    const nums = values.filter((v): v is number => v != null);
    if (!nums.length) return { points: "", w: width, h: height, min: 0, max: 0 };
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;
    const stepX = width / Math.max(values.length - 1, 1);

    const pts: [number, number][] = [];
    values.forEach((v, i) => {
      const x = Math.round(i * stepX);
      const y = v == null ? height / 2 : Math.round(height - ((v - min) / range) * height);
      pts.push([x, y]);
    });

    return {
      points: pts.map(([x, y]) => `${x},${y}`).join(" "),
      raw: pts,
      w: width,
      h: height,
      min,
      max,
    };
  }

  const weightSpark = useMemo(() => sparkPoints(weightVals), [weightVals]);
  const sleepSpark  = useMemo(() => sparkPoints(sleepVals), [sleepVals]);
  const energySpark = useMemo(() => sparkPoints(energyVals), [energyVals]);

  // ---- Premium gate (mask advanced overlays on free)
  const isPremium = tier?.toLowerCase() === "premium";

  // ---- Low-data flags
  const lowDataWeight = (weightVals.filter((v) => v != null).length < 4);
  const lowDataSleep  = (sleepVals.filter((v) => v != null).length < 4);
  const lowDataEnergy = (energyVals.filter((v) => v != null).length < 4);

  if (loading) {
    return (
      <div id="progress" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="flex items-center">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600 mr-2" />
          <span className="text-gray-600">Loading progress…</span>
        </div>
      </div>
    );
  }

  return (
    <div id="progress" className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-[#041B2D] mb-4 flex items-center gap-2">
        <span role="img" aria-label="chart">📊</span> Progress Tracker
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Weight */}
        <Card>
          <Header
            title="Weight Trend"
            subtitle={goals?.target_weight != null ? `Target: ${fmtWeight(goals.target_weight, weightUnit)}` : undefined}
            rightEl={
              <button
                className="text-xs rounded-full border px-2 py-0.5 hover:bg-white"
                onClick={() => setWeightUnit((u) => (u === "lb" ? "kg" : "lb"))}
                aria-label="Toggle weight units"
                title={`Switch to ${weightUnit === "lb" ? "kg" : "lb"}`}
              >
                {weightUnit.toUpperCase()}
              </button>
            }
          />
          <BigNumber
            value={
              weightToday != null
                ? `${fmtWeight(weightToday, weightUnit)}`
                : "—"
            }
            secondary={
              weightDelta != null
                ? deltaText(weightDelta, weightUnit)
                : undefined
            }
          />

          <MetricSpark
            label="Last 30 days"
            color="#7C3AED"
            data={weightSpark}
            goalBand={!isPremium || goals?.target_weight == null ? null : {
              // show ±1 unit around target as a lane
              min: goals.target_weight - (weightUnit === "lb" ? 1 : round1(1 * KG_PER_LB)),
              max: goals.target_weight + (weightUnit === "lb" ? 1 : round1(1 * KG_PER_LB)),
              // convert to current display unit if needed
              convert: (v: number) => (weightUnit === "lb" ? v : round1(v * KG_PER_LB)),
              mask: !isPremium,
            }}
            lowData={lowDataWeight}
            seriesRaw={weightVals}
            unit={weightUnit === "lb" ? "lb" : "kg"}
          />

          {!isPremium && logs.length >= 7 && (
            <GateNote />
          )}
        </Card>

        {/* Sleep */}
        <Card>
          <Header
            title="Sleep Quality"
            subtitle={goals?.target_sleep != null ? `Target: ${goals.target_sleep} / 5` : undefined}
            rightEl={
              woWBadge(sleepWoW, " / 5")
            }
          />
          <div
            className="flex items-center gap-4"
            title="Ring shows your 7-day average vs. a max of 5."
          >
            <ProgressRing value={sleep7 ?? 0} max={5} size={72} />
            <div>
              <div className="text-sm text-gray-600">7-day avg</div>
              <div className="text-xl font-semibold text-[#041B2D]">
                {sleep7 != null ? `${round1(sleep7)} / 5` : "—"}
              </div>
            </div>
          </div>

          <MetricSpark
            label="Last 30 days"
            color="#06C1A0"
            data={sleepSpark}
            goalBand={!isPremium || goals?.target_sleep == null ? null : {
              // band is [target-0.5, target] clamped to [1,5]
              min: Math.max(1, (goals.target_sleep - 0.5)),
              max: Math.min(5, goals.target_sleep),
              convert: (v: number) => v, // same units
              mask: !isPremium,
            }}
            lowData={lowDataSleep}
            seriesRaw={sleepVals}
            unit="/5"
          />

          {!isPremium && logs.length >= 7 && <GateNote />}
        </Card>

        {/* Energy */}
        <Card>
          <Header
            title="Energy Level"
            subtitle={goals?.target_energy != null ? `Target: ${goals.target_energy} / 10` : undefined}
            rightEl={
              woWBadge(energyWoW, " / 10")
            }
          />
          <div
            className="flex items-center gap-4"
            title="Ring shows your 7-day average vs. a max of 10."
          >
            <ProgressRing value={energy7 ?? 0} max={10} size={72} />
            <div>
              <div className="text-sm text-gray-600">7-day avg</div>
              <div className="text-xl font-semibold text-[#041B2D]">
                {energy7 != null ? `${round1(energy7)} / 10` : "—"}
              </div>
            </div>
          </div>

          <MetricSpark
            label="Last 30 days"
            color="#F59E0B"
            data={energySpark}
            goalBand={!isPremium || goals?.target_energy == null ? null : {
              // band is [target-1, target] clamped to [1,10]
              min: Math.max(1, (goals.target_energy - 1)),
              max: Math.min(10, goals.target_energy),
              convert: (v: number) => v,
              mask: !isPremium,
            }}
            lowData={lowDataEnergy}
            seriesRaw={energyVals}
            unit="/10"
          />

          {!isPremium && logs.length >= 7 && <GateNote />}
        </Card>
      </div>
    </div>
  );
}

/* =========================
   UI bits
========================= */

function Card({ children }: { children: React.ReactNode }) {
  // overflow-hidden + relative ensures area/line never bleeds past rounded corners
  return (
    <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 shadow-sm overflow-hidden relative">
      {children}
    </div>
  );
}

function Header({ title, subtitle, rightEl }: { title: string; subtitle?: string; rightEl?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-purple-600">{title}</div>
        {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      </div>
      {rightEl}
    </div>
  );
}

function BigNumber({ value, secondary }: { value: string; secondary?: string }) {
  return (
    <div className="mb-2">
      <div className="text-2xl font-bold text-[#041B2D]">{value}</div>
      {secondary && <div className="text-sm text-gray-600">{secondary}</div>}
    </div>
  );
}

function GateNote() {
  return (
    <div className="mt-2 text-xs text-gray-600">
      Advanced trends are blurred on Free. <a href="/upgrade" className="underline text-[#7C3AED]">Upgrade</a> to unlock.
    </div>
  );
}

/**
 * MetricSpark: smoothed area sparkline with goal band + dots
 */
function MetricSpark({
  label,
  color,
  data,
  goalBand,
  lowData,
  seriesRaw,
  unit,
}: {
  label: string;
  color: string;
  data: { points: string; raw?: [number, number][]; w: number; h: number; min: number; max: number };
  goalBand: null | { min: number; max: number; convert: (v: number) => number; mask: boolean };
  lowData: boolean;
  seriesRaw: (number | null)[];
  unit: string;
}) {
  const pts = (data.raw || []);
  const hasLine = pts.length >= 2;

  // Smoothing: Catmull–Rom → Bezier
  const pathD = hasLine ? catmullRomPath(pts) : "";
  const areaD = hasLine ? `${pathD} L ${pts[pts.length - 1][0]} ${data.h} L ${pts[0][0]} ${data.h} Z` : "";

  // Dots (min/max/last) + titles
  const yValues = pts.map(([, y]) => y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const lastPt = pts[pts.length - 1];

  // Goal band rect (convert target values -> current scale)
  let band: null | { yTop: number; height: number } = null;
  if (goalBand && hasLine) {
    const { min, max, convert } = goalBand;
    // map domain value v -> y
    const mapY = (v: number) => {
      const conv = convert(v);
      const rng = (data.max - data.min) || 1;
      const scaled = data.h - ((conv - convert(data.min)) / (convert(data.max) - convert(data.min) || 1)) * data.h;
      // If convert is identity, fallback to original scale
      if (!Number.isFinite(scaled)) {
        const y = data.h - ((v - data.min) / rng) * data.h;
        return clamp(y, 0, data.h);
      }
      return clamp(scaled, 0, data.h);
    };
    const y1 = mapY(min);
    const y2 = mapY(max);
    const top = Math.min(y1, y2);
    const height = Math.abs(y2 - y1);
    band = { yTop: top, height };
  }

  // Unique gradient id per label
  const gid = `grad-${label.replace(/\s+/g, "-").toLowerCase()}`;

  // Native tooltips for dots use the last 30 raw values (seriesRaw)
  const numericSeries = seriesRaw.filter((v): v is number => v != null);

  return (
    <div>
      <div className="text-xs text-gray-600 mb-1 flex items-center gap-1">
        {label}
        <span className="inline-block w-4 h-4 rounded-full bg-gray-100 text-gray-600 text-[10px] leading-4 text-center" title="Last 30 days">?</span>
      </div>

      <svg
        width="100%"
        height={data.h}
        viewBox={`0 0 ${data.w} ${data.h}`}
        preserveAspectRatio="none"
        className={`block ${!hasLine ? "" : ""}`}
        role="img"
        aria-label={`${label} sparkline`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${gid}-clip`}>
            <rect x="0" y="0" width={data.w} height={data.h} rx="8" ry="8" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${gid}-clip)`}>
          {/* Goal band (premium) */}
          {band && (
            <rect
              x={0}
              y={band.yTop}
              width={data.w}
              height={band.height}
              fill={goalBand?.mask ? "url(#none)" : color}
              opacity={goalBand?.mask ? 0.0 : 0.08}
            />
          )}

          {/* Area + line */}
          {hasLine && <path d={areaD} fill={`url(#${gid})`} />}
          {hasLine && <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

          {/* Low-data placeholder */}
          {!hasLine && (
            <text x="50%" y={data.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#6B7280">
              Log 3 more days to unlock trends
            </text>
          )}

          {/* Min/Max/Last dots (with native tooltips) */}
          {hasLine && pts.map(([x, y], i) => (y === minY ? (
            <circle key={`min-${i}`} cx={x} cy={y} r="2.8" fill={color} opacity="0.9">
              <title>Min: {fmtValue(numericSeries[i], unit)}</title>
            </circle>
          ) : null))}
          {hasLine && pts.map(([x, y], i) => (y === maxY ? (
            <circle key={`max-${i}`} cx={x} cy={y} r="2.8" fill={color} opacity="0.9">
              <title>Max: {fmtValue(numericSeries[i], unit)}</title>
            </circle>
          ) : null))}
          {hasLine && lastPt && (
            <circle cx={lastPt[0]} cy={lastPt[1]} r="3.2" fill={color}>
              <title>Last: {fmtValue(numericSeries[numericSeries.length - 1], unit)}</title>
            </circle>
          )}
        </g>
      </svg>
    </div>
  );
}

/* Smoothed path from Catmull–Rom points */
function catmullRomPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  const d: string[] = [];
  d.push(`M ${pts[0][0]} ${pts[0][1]}`);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || pts[i + 1];
    const t = 0.5; // tension 0..1
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * t;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * t;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * t;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * t;
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`);
  }
  return d.join(" ");
}

/* Progress ring */
function ProgressRing({ value, max, size = 72 }: { value: number; max: number; size?: number }) {
  const v = Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
  const pct = Math.max(0, Math.min(1, max ? v / max : 0));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const rest = c - dash;

  return (
    <svg width={size} height={size} role="img" aria-label={`Progress ${Math.round(pct * 100)}%`}>
      <title>{`Progress: ${Math.round(pct * 100)}% of maximum`}</title>
      <circle cx={size/2} cy={size/2} r={r} stroke="#E5E7EB" strokeWidth={stroke} fill="none" />
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke="#06C1A0"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${rest}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="12" fill="#041B2D">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

/* Badges & utils */
function woWBadge(delta: number | null, suffix: string) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta > 0;
  const label = `${up ? "▲" : delta < 0 ? "▼" : "■"} ${Math.abs(delta)}${suffix}`;
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 border ${
      up ? "border-teal-300 bg-teal-50 text-teal-700" : delta < 0 ? "border-rose-300 bg-rose-50 text-rose-700" : "border-gray-300 bg-gray-50 text-gray-700"
    }`} title="Week-over-week change (last 7 vs prior 7)">
      {label}
    </span>
  );
}

function deltaText(d: number, unit: "lb" | "kg") {
  const sign = d > 0 ? "+" : "";
  const u = unit;
  return `Δ ${sign}${Math.abs(d)} ${u} vs 30-day start`;
}

function fmtWeight(v: number, unit: "lb" | "kg") {
  return unit === "lb" ? `${v} lb` : `${v} kg`;
}

function fmtValue(v: number | undefined, unit: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "lb" || unit === "kg") return `${v} ${unit}`;
  return `${v}${unit.startsWith("/") ? ` ${unit}` : unit ? ` ${unit}` : ""}`;
}

function round1(n: number) { return Math.round(n * 10) / 10; }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
