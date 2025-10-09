"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

/**
 * ProgressTracker.tsx
 * - Reads last 30 logs and current goals
 * - Renders Weight, Sleep, Energy trends
 * - Premium micro-viz: smoothed area-sparklines + progress rings (no chart libs)
 *
 * Tables:
 *  - public.logs(user_id, log_date, weight, sleep, energy)
 *  - public.goals(user_id, target_weight, target_sleep, target_energy)
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
};

export default function ProgressTracker() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [goals, setGoals] = useState<GoalsRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userWrap } = await supabase.auth.getUser();
      const userId = userWrap?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Fetch last 30 logs (ascending for neat charts)
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
      setLoading(false);
    })();
  }, [supabase]);

  // Helpers
  const toNums = (arr: (number | null | undefined)[]) =>
    arr.map((v) => (typeof v === "number" ? v : null));

  const last = <T,>(arr: T[]) => (arr.length ? arr[arr.length - 1] : undefined);

  const avg = (arr: (number | null)[]) => {
    const nums = arr.filter((n): n is number => n != null && Number.isFinite(n));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const sliceLastNDays = (rows: LogRow[], n: number) =>
    rows.slice(Math.max(0, rows.length - n));

  // Build metrics
  const weightVals = useMemo(() => toNums(logs.map((l) => l.weight)), [logs]);
  const sleepVals  = useMemo(() => toNums(logs.map((l) => l.sleep)), [logs]);
  const energyVals = useMemo(() => toNums(logs.map((l) => l.energy)), [logs]);

  const weightToday = useMemo(() => last(weightVals) ?? null, [weightVals]);
  const sleep7 = useMemo(() => avg(toNums(sliceLastNDays(logs, 7).map((l) => l.sleep))), [logs]);
  const energy7 = useMemo(() => avg(toNums(sliceLastNDays(logs, 7).map((l) => l.energy))), [logs]);

  // Sparkline data (scaled to 0..h)
  function sparkPoints(values: (number | null)[], width = 220, height = 64) {
    const nums = values.filter((v): v is number => v != null);
    if (!nums.length) return { points: "", w: width, h: height };
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;
    const stepX = width / Math.max(values.length - 1, 1);

    const pts: string[] = [];
    values.forEach((v, i) => {
      const x = Math.round(i * stepX);
      const y = v == null ? height / 2 : Math.round(height - ((v - min) / range) * height);
      pts.push(`${x},${y}`);
    });
    return { points: pts.join(" "), w: width, h: height };
  }

  const weightSpark = useMemo(() => sparkPoints(weightVals), [weightVals]);
  const sleepSpark  = useMemo(() => sparkPoints(sleepVals), [sleepVals]);
  const energySpark = useMemo(() => sparkPoints(energyVals), [energyVals]);

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
            subtitle={goals?.target_weight != null ? `Target: ${goals.target_weight} lb` : undefined}
          />
          <BigNumber value={weightToday != null ? `${weightToday} lb` : "—"} />
          <div className="mt-2" title="Based on your last 30 daily logs.">
            <Sparkline
              label="Last 30 days"
              color="#7C3AED"
              points={weightSpark.points}
              w={weightSpark.w}
              h={weightSpark.h}
            />
          </div>
        </Card>

        {/* Sleep */}
        <Card>
          <Header
            title="Sleep Quality"
            subtitle={goals?.target_sleep != null ? `Target: ${goals.target_sleep} / 5` : undefined}
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
          <div className="mt-2" title="Based on your last 30 daily logs.">
            <Sparkline
              label="Last 30 days"
              color="#06C1A0"
              points={sleepSpark.points}
              w={sleepSpark.w}
              h={sleepSpark.h}
            />
          </div>
        </Card>

        {/* Energy */}
        <Card>
          <Header
            title="Energy Level"
            subtitle={goals?.target_energy != null ? `Target: ${goals.target_energy} / 10` : undefined}
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
          <div className="mt-2" title="Based on your last 30 daily logs.">
            <Sparkline
              label="Last 30 days"
              color="#F59E0B"
              points={energySpark.points}
              w={energySpark.w}
              h={energySpark.h}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* UI bits */
function Card({ children }: { children: React.ReactNode }) {
  // overflow-hidden + relative ensures the area/line never bleeds past rounded corners
  return (
    <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 shadow-sm overflow-hidden relative">
      {children}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <div className="text-xs uppercase tracking-wide text-purple-600">{title}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}

function BigNumber({ value }: { value: string }) {
  return <div className="text-2xl font-bold text-[#041B2D] mb-2">{value}</div>;
}

/**
 * Premium sparkline:
 * - Parses "x,y x,y ..." points
 * - Smooths with Catmull–Rom → Bezier
 * - Fills area with soft gradient
 * - Marks min/max/last with dots
 * - Responsive and clipped by Card
 */
function Sparkline({
  label, color, points, w, h,
}: {
  label: string;
  color: string;
  points: string; // "x,y x,y ..."
  w: number;
  h: number;
}) {
  const parsed = points
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(",").map((n) => Number(n))) as [number, number][];

  if (parsed.length < 2) {
    return (
      <div>
        <div className="text-xs text-gray-600 mb-1">{label}</div>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block" />
      </div>
    );
  }

  // Catmull–Rom -> Bezier smoothing
  const pathD = (() => {
    const p = parsed;
    const d: string[] = [];
    d.push(`M ${p[0][0]} ${p[0][1]}`);
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i === 0 ? 0 : i - 1];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2] || p[i + 1];
      const t = 0.5; // tension 0..1 (0=straight)
      const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * t;
      const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * t;
      const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * t;
      const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * t;
      d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`);
    }
    return d.join(" ");
  })();

  const areaD = `${pathD} L ${parsed[parsed.length - 1][0]} ${h} L ${parsed[0][0]} ${h} Z`;

  // dots: min, max, last
  const yVals = parsed.map(([, y]) => y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const lastPt = parsed[parsed.length - 1];

  // unique gradient id
  const gid = `grad-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div>
      <div className="text-xs text-gray-600 mb-1 flex items-center gap-1">
        {label}
        <span className="inline-block w-4 h-4 rounded-full bg-gray-100 text-gray-600 text-[10px] leading-4 text-center" title="Last 30 days">?</span>
      </div>

      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label={`${label} sparkline`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area */}
        <path d={areaD} fill={`url(#${gid})`} />

        {/* Smoothed line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Min/Max/Last dots */}
        {parsed.map(([x, y], i) => (y === minY ? <circle key={`min-${i}`} cx={x} cy={y} r="2.8" fill={color} opacity="0.9" /> : null))}
        {parsed.map(([x, y], i) => (y === maxY ? <circle key={`max-${i}`} cx={x} cy={y} r="2.8" fill={color} opacity="0.9" /> : null))}
        <circle cx={lastPt[0]} cy={lastPt[1]} r="3.2" fill={color} />
      </svg>
    </div>
  );
}

function ProgressRing({ value, max, size = 72 }: { value: number; max: number; size?: number }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
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

/* small utils */
function round1(n: number) { return Math.round(n * 10) / 10; }
