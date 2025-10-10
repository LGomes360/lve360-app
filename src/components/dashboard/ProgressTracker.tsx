"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Loader2 } from "lucide-react";

/**
 * ProgressTracker.tsx — Premium micro-viz + interactions
 * Upgrades:
 *  - Clamped tooltips so dates never clip at edges
 *  - 7d / 30d / 90d tabs (changes SQL limit + metrics)
 *  - Tap-to-pin note on any data point (writes to logs.notes)
 *  - Goal-hit confetti if “today” is inside goal band
 *
 * Tables:
 *  - public.logs(user_id, log_date, weight, sleep, energy, notes)
 *  - public.goals(user_id, target_weight, target_sleep, target_energy)
 *  - public.users(id, tier)
 */

type LogRow = {
  log_date: string; // ISO date
  weight: number | null; // pounds
  sleep: number | null; // 1–5
  energy: number | null; // 1–10
  notes?: string | null;
};

type GoalsRow = {
  target_weight: number | null;
  target_sleep: number | null;
  target_energy: number | null;
};

const KG_PER_LB = 0.45359237;
const UNIT_KEY = "lve360_weight_unit"; // "lb" | "kg"

type RangeKey = "7" | "30" | "90";

export default function ProgressTracker() {
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>("free");
  const [goals, setGoals] = useState<GoalsRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // range tabs
  const [range, setRange] = useState<RangeKey>("30");

  // logs (ascending)
  const [logs, setLogs] = useState<LogRow[]>([]);
  const seriesDates = useMemo(() => logs.map((l) => l.log_date), [logs]);

  // weight unit toggle
  const [weightUnit, setWeightUnit] = useState<"lb" | "kg">(
    (typeof window !== "undefined" && (localStorage.getItem(UNIT_KEY) as "lb" | "kg")) || "lb"
  );
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(UNIT_KEY, weightUnit);
  }, [weightUnit]);

  // confetti trigger flags per metric (play once per render when condition hit)
  const [confetti, setConfetti] = useState<{ weight: boolean; sleep: boolean; energy: boolean }>({
    weight: false,
    sleep: false,
    energy: false,
  });

  // fetch on mount + when range changes
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setLogs([]);
        setLoading(false);
        return;
      }

      // Pull last N days for this range
      const limit = range === "7" ? 7 : range === "30" ? 30 : 90;

      const { data: rows } = await supabase
        .from("logs")
        .select("log_date, weight, sleep, energy, notes")
        .eq("user_id", uid)
        .order("log_date", { ascending: true })
        .limit(limit);

      setLogs((rows ?? []) as LogRow[]);

      const { data: g } = await supabase
        .from("goals")
        .select("target_weight, target_sleep, target_energy")
        .eq("user_id", uid)
        .maybeSingle();
      setGoals((g ?? null) as GoalsRow | null);

      const { data: u } = await supabase
        .from("users")
        .select("tier")
        .eq("id", uid)
        .maybeSingle();
      setTier((u?.tier || "free") as string);

      setLoading(false);
      // reset confetti on range switch
      setConfetti({ weight: false, sleep: false, energy: false });
    })();
  }, [supabase, range]);

  // ---------- Helpers
  const toNums = (arr: (number | null | undefined)[]) =>
    arr.map((v) => (typeof v === "number" ? v : null));
  const last = <T,>(arr: T[]) => (arr.length ? arr[arr.length - 1] : undefined);
  const avg = (arr: (number | null)[]) => {
    const nums = arr.filter((n): n is number => n != null && Number.isFinite(n));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };
  const sliceLast = <T,>(rows: T[], n: number) => rows.slice(Math.max(0, rows.length - n));

  // ---------- Build series
  const weightValsRaw = useMemo(() => toNums(logs.map((l) => l.weight)), [logs]);
  const sleepVals = useMemo(() => toNums(logs.map((l) => l.sleep)), [logs]);
  const energyVals = useMemo(() => toNums(logs.map((l) => l.energy)), [logs]);

  const weightVals = useMemo(() => {
    if (weightUnit === "lb") return weightValsRaw;
    return weightValsRaw.map((v) => (v == null ? null : round1(v * KG_PER_LB)));
  }, [weightValsRaw, weightUnit]);

  const isPremium = (tier || "").toLowerCase() === "premium";

  // ---------- Metrics
  const weightToday = useMemo(() => last(weightVals) ?? null, [weightVals]);
  const weightBaseline = useMemo(() => weightVals.find((v) => v != null) ?? null, [weightVals]);
  const weightDelta = useMemo(() => {
    if (weightToday == null || weightBaseline == null) return null;
    return round1(weightToday - weightBaseline);
  }, [weightToday, weightBaseline]);

  const sleep7 = useMemo(() => avg(toNums(sliceLast(logs, 7).map((l) => l.sleep))), [logs]);
  const energy7 = useMemo(() => avg(toNums(sliceLast(logs, 7).map((l) => l.energy))), [logs]);

  // week-over-week deltas (last 7 vs prior 7) – independent of selected range
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

  // ---------- Sparkline points
  function spark(values: (number | null)[], width = 220, height = 64) {
    const nums = values.filter((v): v is number => v != null);
    if (!nums.length) {
      return { points: "", raw: [] as [number, number][], w: width, h: height, min: 0, max: 0 };
    }
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

  const weightSpark = useMemo(() => spark(weightVals), [weightVals]);
  const sleepSpark = useMemo(() => spark(sleepVals), [sleepVals]);
  const energySpark = useMemo(() => spark(energyVals), [energyVals]);

  // ---------- Goal-hit confetti (plays once per metric if today ∈ band)
  useEffect(() => {
    const trigger = (key: "weight" | "sleep" | "energy") =>
      setConfetti((c) => (c[key] ? c : { ...c, [key]: true }));

    // weight
    if (isPremium && goals?.target_weight != null && weightToday != null) {
      const target = weightUnit === "lb" ? goals.target_weight : round1(goals.target_weight * KG_PER_LB);
      const within = Math.abs(weightToday - target) <= (weightUnit === "lb" ? 1 : round1(1 * KG_PER_LB));
      if (within) trigger("weight");
    }
    // sleep
    if (isPremium && goals?.target_sleep != null && sleep7 != null) {
      // band [target-0.5, target]
      const within = sleep7 >= Math.max(1, goals.target_sleep - 0.5) && sleep7 <= Math.min(5, goals.target_sleep);
      if (within) trigger("sleep");
    }
    // energy
    if (isPremium && goals?.target_energy != null && energy7 != null) {
      // band [target-1, target]
      const within = energy7 >= Math.max(1, goals.target_energy - 1) && energy7 <= Math.min(10, goals.target_energy);
      if (within) trigger("energy");
    }
  }, [isPremium, goals, weightToday, sleep7, energy7, weightUnit]);

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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#041B2D] flex items-center gap-2">
          <span role="img" aria-label="chart">📊</span> Progress Tracker
        </h2>

        {/* Range tabs */}
        <div className="inline-flex rounded-xl border border-purple-200 bg-white overflow-hidden">
          {(["7", "30", "90"] as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`px-3 py-1.5 text-sm ${range === k ? "bg-purple-50 text-[#7C3AED]" : "hover:bg-gray-50 text-gray-700"}`}
              aria-pressed={range === k}
            >
              {k}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Weight */}
        <Card>
          <Header
            title="Weight Trend"
            subtitle={goals?.target_weight != null ? `Target: ${fmtWeight(weightUnit === "lb" ? goals.target_weight : round1(goals.target_weight * KG_PER_LB), weightUnit)}` : undefined}
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
            value={weightToday != null ? `${fmtWeight(weightToday, weightUnit)}` : "—"}
            secondary={weightDelta != null ? deltaText(weightDelta, weightUnit) : undefined}
          />

          <MetricSpark
            label={`Last ${range} days`}
            color="#7C3AED"
            data={weightSpark}
            seriesRaw={weightVals}
            seriesDates={seriesDates}
            unit={weightUnit}
            goalBand={
              !isPremium || goals?.target_weight == null
                ? null
                : {
                    min: goals.target_weight - (weightUnit === "lb" ? 1 : round1(1 * KG_PER_LB)),
                    max: goals.target_weight + (weightUnit === "lb" ? 1 : round1(1 * KG_PER_LB)),
                    convert: (v: number) => (weightUnit === "lb" ? v : round1(v * KG_PER_LB)),
                  }
            }
            onPin={async (idx, note) => {
              await upsertNoteForIndex(supabase, userId, logs, idx, note);
            }}
            showConfetti={confetti.weight}
          />
        </Card>

        {/* Sleep */}
        <Card>
          <Header
            title="Sleep Quality"
            subtitle={goals?.target_sleep != null ? `Target: ${goals.target_sleep} / 5` : undefined}
            rightEl={woWBadge(sleepWoW, " / 5")}
          />

          <div className="flex items-center gap-4" title="Ring shows your 7-day average vs. a max of 5.">
            <ProgressRing value={sleep7 ?? 0} max={5} size={72} />
            <div>
              <div className="text-sm text-gray-600">7-day avg</div>
              <div className="text-xl font-semibold text-[#041B2D]">
                {sleep7 != null ? `${round1(sleep7)} / 5` : "—"}
              </div>
            </div>
          </div>

          <MetricSpark
            label={`Last ${range} days`}
            color="#06C1A0"
            data={sleepSpark}
            seriesRaw={sleepVals}
            seriesDates={seriesDates}
            unit="/5"
            goalBand={
              !isPremium || goals?.target_sleep == null
                ? null
                : {
                    min: Math.max(1, goals.target_sleep - 0.5),
                    max: Math.min(5, goals.target_sleep),
                    convert: (v: number) => v,
                  }
            }
            onPin={async (idx, note) => {
              await upsertNoteForIndex(supabase, userId, logs, idx, note);
            }}
            showConfetti={confetti.sleep}
          />
        </Card>

        {/* Energy */}
        <Card>
          <Header
            title="Energy Level"
            subtitle={goals?.target_energy != null ? `Target: ${goals.target_energy} / 10` : undefined}
            rightEl={woWBadge(energyWoW, " / 10")}
          />

          <div className="flex items-center gap-4" title="Ring shows your 7-day average vs. a max of 10.">
            <ProgressRing value={energy7 ?? 0} max={10} size={72} />
            <div>
              <div className="text-sm text-gray-600">7-day avg</div>
              <div className="text-xl font-semibold text-[#041B2D]">
                {energy7 != null ? `${round1(energy7)} / 10` : "—"}
              </div>
            </div>
          </div>

          <MetricSpark
            label={`Last ${range} days`}
            color="#F59E0B"
            data={energySpark}
            seriesRaw={energyVals}
            seriesDates={seriesDates}
            unit="/10"
            goalBand={
              !isPremium || goals?.target_energy == null
                ? null
                : {
                    min: Math.max(1, goals.target_energy - 1),
                    max: Math.min(10, goals.target_energy),
                    convert: (v: number) => v,
                  }
            }
            onPin={async (idx, note) => {
              await upsertNoteForIndex(supabase, userId, logs, idx, note);
            }}
            showConfetti={confetti.energy}
          />
        </Card>
      </div>
    </div>
  );
}

/* =========================
   UI bits
========================= */

function Card({ children }: { children: React.ReactNode }) {
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

/**
 * MetricSpark — smoothed sparkline + clamped tooltip + pin-to-note + optional goal band + confetti
 */
function MetricSpark({
  label,
  color,
  data,
  goalBand,
  seriesRaw,
  seriesDates,
  unit,
  onPin,
  showConfetti,
}: {
  label: string;
  color: string;
  data: { points: string; raw: [number, number][]; w: number; h: number; min: number; max: number };
  goalBand: null | { min: number; max: number; convert: (v: number) => number };
  seriesRaw: (number | null)[];
  seriesDates: string[];
  unit: string; // "lb" | "kg" | "/5" | "/10"
  onPin: (index: number, note: string) => Promise<void>;
  showConfetti?: boolean;
}) {
  const pts = data.raw;
  const hasLine = pts.length >= 2;

  // Smoothing: Catmull–Rom → Bezier
  const pathD = hasLine ? catmullRomPath(pts) : "";
  const areaD = hasLine ? `${pathD} L ${pts[pts.length - 1][0]} ${data.h} L ${pts[0][0]} ${data.h} Z` : "";

  // Tooltip with edge clamping
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipLeftPx, setTipLeftPx] = useState<number | null>(null);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !hasLine) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xClient = e.clientX - rect.left;
    const idx = Math.round((xClient / rect.width) * (pts.length - 1));
    const clampedIdx = clamp(idx, 0, pts.length - 1);
    setHoverIdx(clampedIdx);

    const svgX = pts[clampedIdx][0]; // viewBox units
    const pxX = (svgX / data.w) * rect.width; // css px

    const tipW = tipRef.current?.offsetWidth ?? 120;
    const margin = 6;
    const left = clamp(pxX - tipW / 2, margin, rect.width - tipW - margin);
    setTipLeftPx(left);
  }
  function onLeave() {
    setHoverIdx(null);
    setTipLeftPx(null);
  }

  // Pin note popover (simple, inline)
  const [pinOpen, setPinOpen] = useState(false);
  const [pinText, setPinText] = useState("");
  async function onClickSVG() {
    if (hoverIdx == null) return;
    setPinOpen(true);
  }
  async function savePin() {
    if (hoverIdx == null || !pinText.trim()) {
      setPinOpen(false);
      setPinText("");
      return;
    }
    try {
      await onPin(hoverIdx, pinText.trim());
    } finally {
      setPinOpen(false);
      setPinText("");
    }
  }

  // Dots min/max/last
  const yValues = pts.map(([, y]) => y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const lastPt = pts[pts.length - 1];

  // Goal band rect in current scale
  let band: null | { yTop: number; height: number } = null;
  if (goalBand && hasLine) {
    const { min, max, convert } = goalBand;
    const y1 = mapToY(convert(min), convert(data.min), convert(data.max), data.h);
    const y2 = mapToY(convert(max), convert(data.min), convert(data.max), data.h);
    const top = Math.min(y1, y2);
    const height = Math.abs(y2 - y1);
    band = { yTop: top, height };
  }

  const gid = `grad-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const hv = hoverIdx != null ? seriesRaw[hoverIdx] : null;
  const hDate = hoverIdx != null ? seriesDates[hoverIdx] : null;
  const hp = hoverIdx != null ? pts[hoverIdx] : null;

  return (
    <div>
      <div className="text-xs text-gray-600 mb-1 flex items-center gap-1">
        {label}
        <span className="inline-block w-4 h-4 rounded-full bg-gray-100 text-gray-600 text-[10px] leading-4 text-center" title="Hover to see exact values">?</span>
      </div>

      <div className="relative">
        {/* Tooltip (clamped) */}
        {hv != null && hp && tipLeftPx != null && (
          <div
            ref={tipRef}
            className="absolute -top-6 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs shadow-sm"
            style={{ left: tipLeftPx }}
          >
            {formatDate(hDate)} • {fmtValue(hv ?? undefined, unit)}
          </div>
        )}

        {/* Confetti burst (tiny, tasteful) */}
        {showConfetti && (
          <div className="pointer-events-none absolute -top-1 right-2 h-0 w-0">
            <ConfettiBurst />
          </div>
        )}

        {/* Pin note popover */}
        {pinOpen && hp && (
          <div
            className="absolute z-10 -top-2 left-1/2 -translate-x-1/2 rounded-xl border border-purple-200 bg-white p-3 shadow-lg w-[min(280px,90%)]"
            role="dialog"
            aria-label="Pin a note"
          >
            <div className="text-xs text-gray-600 mb-1">
              Note for <strong>{formatDate(hDate)}</strong>
            </div>
            <input
              className="w-full rounded-lg border px-2 py-1 text-sm"
              placeholder="e.g., Late workout boosted energy"
              value={pinText}
              onChange={(e) => setPinText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") savePin();
                if (e.key === "Escape") setPinOpen(false);
              }}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <button className="text-sm rounded-md border px-2 py-1" onClick={() => setPinOpen(false)}>
                Cancel
              </button>
              <button className="text-sm rounded-md bg-gradient-to-r from-[#06C1A0] to-[#7C3AED] text-white px-3 py-1" onClick={savePin}>
                Save
              </button>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          width="100%"
          height={data.h}
          viewBox={`0 0 ${data.w} ${data.h}`}
          preserveAspectRatio="none"
          className="block"
          role="img"
          aria-label={`${label} sparkline`}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClickSVG}
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
            {band && <rect x={0} y={band.yTop} width={data.w} height={band.height} fill={color} opacity={0.08} />}

            {hasLine && <path d={areaD} fill={`url(#${gid})`} />}
            {hasLine && (
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ strokeDasharray: 1000, strokeDashoffset: 1000, animation: "lve-stroke 900ms ease-out forwards" }}
              />
            )}

            {!hasLine && (
              <text x="50%" y={data.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#6B7280">
                Log 3 more days to unlock trends
              </text>
            )}

            {/* Min / Max / Last dots */}
            {hasLine && pts.map(([x, y], i) => (y === minY ? <circle key={`min-${i}`} cx={x} cy={y} r="2.8" fill={color} opacity="0.9" /> : null))}
            {hasLine && pts.map(([x, y], i) => (y === maxY ? <circle key={`max-${i}`} cx={x} cy={y} r="2.8" fill={color} opacity="0.9" /> : null))}
            {hasLine && lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r="3.2" fill={color} />}

            {/* Hover tracker */}
            {hasLine && hoverIdx != null && (
              <>
                <line x1={hp![0]} y1={0} x2={hp![0]} y2={data.h} stroke="#9CA3AF" strokeDasharray="3,3" />
                <circle cx={hp![0]} cy={hp![1]} r="3.6" fill={color} />
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

function ConfettiBurst() {
  // very tiny non-intrusive burst; pure CSS
  return (
    <div className="relative">
      {[...Array(7)].map((_, i) => (
        <span key={i} className={`absolute block w-1.5 h-1.5 rounded-full animate-[burst_700ms_ease-out_forwards]`}
          style={{
            background: ["#7C3AED", "#06C1A0", "#F59E0B", "#3B82F6", "#EF4444", "#10B981", "#8B5CF6"][i % 7],
            transform: `rotate(${i * (360 / 7)}deg) translateY(-2px)`,
            transformOrigin: "0 0",
            left: 0, top: 0,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes burst {
          0% { opacity: 0; transform: translate(0,0) scale(0.6); }
          40% { opacity: 1; }
          100% { opacity: 0; transform: translate(10px,-18px) scale(1.2); }
        }
        @keyframes lve-stroke { to { stroke-dashoffset: 0; } }
      `}</style>
    </div>
  );
}

/* ------------------------
   Small components/utils
------------------------ */

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
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#E5E7EB" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#06C1A0"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${rest}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="12" fill="#041B2D">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function woWBadge(delta: number | null, suffix: string) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta > 0;
  const label = `${up ? "▲" : delta < 0 ? "▼" : "■"} ${Math.abs(delta)}${suffix}`;
  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 border ${
        up
          ? "border-teal-300 bg-teal-50 text-teal-700"
          : delta < 0
          ? "border-rose-300 bg-rose-50 text-rose-700"
          : "border-gray-300 bg-gray-50 text-gray-700"
      }`}
      title="Week-over-week change (last 7 vs prior 7)"
    >
      {label}
    </span>
  );
}

function deltaText(d: number, unit: "lb" | "kg") {
  const sign = d > 0 ? "+" : "";
  return `Δ ${sign}${Math.abs(d)} ${unit} vs start`;
}

function fmtWeight(v: number, unit: "lb" | "kg") {
  return unit === "lb" ? `${v} lb` : `${v} kg`;
}

function fmtValue(v: number | undefined, unit: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "lb" || unit === "kg") return `${v} ${unit}`;
  return `${v}${unit.startsWith("/") ? ` ${unit}` : unit ? ` ${unit}` : ""}`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function mapToY(v: number, domainMin: number, domainMax: number, height: number) {
  const rng = domainMax - domainMin || 1;
  const y = height - ((v - domainMin) / rng) * height;
  return clamp(y, 0, height);
}
function catmullRomPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  const d: string[] = [];
  d.push(`M ${pts[0][0]} ${pts[0][1]}`);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || pts[i + 1];
    const t = 0.5;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * t;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * t;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * t;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * t;
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`);
  }
  return d.join(" ");
}
function formatDate(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

/* ------------------------
   Notes: update/insert (fixed typing)
------------------------ */
type LogNoteRow = { id: string; notes: string | null };

async function upsertNoteForIndex(
  supabase: ReturnType<typeof createClientComponentClient>,
  userId: string | null,
  logs: { log_date: string }[],
  idx: number,
  note: string
) {
  if (!userId) return;
  const date = logs[idx]?.log_date;
  if (!date) return;

  const { data: existing, error } = await supabase
    .from("logs")
    .select("id, notes")
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    // optional: surface or log silently
    console.error("Fetch note row failed:", error.message);
    return;
  }

  const rows = (existing ?? []) as LogNoteRow[];

  if (rows[0]?.id) {
    // append bullet if notes already exist
    const prev = rows[0].notes ?? "";
    const next = prev ? `${prev}\n• ${note}` : note;
    await supabase.from("logs").update({ notes: next }).eq("id", rows[0].id);
  } else {
    // no row on that date yet → insert minimal log with this note
    await supabase.from("logs").insert({ user_id: userId, log_date: date, notes: note });
  }
}

