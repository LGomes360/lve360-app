import Link from "next/link";
import { Activity, Apple, BedDouble, Flame, Footprints, HeartPulse, Scale } from "lucide-react";

import type { ConnectedHealthSummary } from "@/lib/connectedHealth";

export default function ConnectedHealthCard({
  summary,
  weightUnit,
}: {
  summary: ConnectedHealthSummary | null;
  weightUnit: "lb" | "kg";
}) {
  if (!summary || summary.status === "disconnected" || !summary.latest) return null;
  const latest = summary.latest;
  const metrics = [
    latest.steps == null ? null : { icon: Footprints, label: "Steps", value: latest.steps.toLocaleString() },
    latest.sleep_minutes == null ? null : { icon: BedDouble, label: "Sleep", value: formatMinutes(latest.sleep_minutes) },
    latest.resting_heart_rate == null ? null : { icon: HeartPulse, label: "Resting heart rate", value: `${Math.round(latest.resting_heart_rate)} bpm` },
    latest.weight_kg == null ? null : { icon: Scale, label: "Weight", value: formatWeight(latest.weight_kg, weightUnit) },
    latest.active_energy_kcal == null ? null : { icon: Flame, label: "Active energy", value: `${Math.round(latest.active_energy_kcal).toLocaleString()} kcal` },
    latest.exercise_minutes == null ? null : { icon: Activity, label: "Exercise", value: `${latest.exercise_minutes} min` },
  ].filter((metric): metric is NonNullable<typeof metric> => metric != null);
  if (metrics.length === 0) return null;

  return (
    <section aria-labelledby="connected-health-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-950 p-2.5 text-white"><Apple className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#087F72]">Connected health</p>
            <h2 id="connected-health-title" className="mt-1 text-xl font-black text-[#041B2D]">
              {summary.provider === "apple_health_shortcuts" ? "Apple Health via iPhone Shortcut" : "Apple Health signals"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {summary.provider === "apple_health_shortcuts"
                ? "Daily steps sent by your iPhone Shortcut. Compare the first total with Apple Health before relying on it."
                : "Daily summaries you chose to share. These inform wellness context and do not replace medical measurements."}
            </p>
          </div>
        </div>
        <p className="rounded-full bg-[#EAFBF8] px-3 py-1.5 text-xs font-bold text-[#06695F]">
          {formatDate(latest.local_date)}
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Icon className="h-4 w-4 text-[#087F72]" aria-hidden="true" />
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-[#041B2D]">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Last synced {formatTimestamp(summary.lastSyncCompletedAt)}. LVE360 stores daily totals, not raw HealthKit samples, routes, or clinical records.
      </p>
      {summary.provider === "apple_health_shortcuts" ? (
        <Link href="/settings/connected-health" className="mt-3 inline-block text-sm font-semibold text-[#047F6D] hover:underline">
          Manage iPhone Shortcut
        </Link>
      ) : null}
    </section>
  );
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function formatWeight(kilograms: number, unit: "lb" | "kg"): string {
  if (unit === "kg") return `${kilograms.toFixed(1)} kg`;
  return `${(kilograms * 2.2046226218).toFixed(1)} lb`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function formatTimestamp(value: string | null): string {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
