import type { ConnectedHealthSummary } from "@/lib/connectedHealth";

export type HealthPictureCheckIn = {
  sleep: number | null;
  energy: number | null;
  weight: number | null;
};

export type HealthPictureLabSummary = {
  summary: string;
  memberApproved: boolean;
  resultWindow: string | null;
};

export type HealthPictureSource = "combined" | "member_reported" | "connected_data" | "lab_summary" | "limited";

export type HealthPictureDomain = {
  key: "sleep" | "movement" | "nutrition_weight" | "overall_feeling" | "lab_balance";
  label: string;
  source: HealthPictureSource;
  sourceLabel: string;
  summary: string;
};

export type HealthPicture = {
  domains: HealthPictureDomain[];
  guidance: string;
};

export function buildHealthPicture({
  connectedHealth,
  checkIn,
  weightUnit,
  labSummary = null,
}: {
  connectedHealth: ConnectedHealthSummary | null;
  checkIn: HealthPictureCheckIn | null;
  weightUnit: "lb" | "kg";
  labSummary?: HealthPictureLabSummary | null;
}): HealthPicture {
  const latest = connectedHealth?.status === "connected" ? connectedHealth.latest : null;
  const sleepDuration = latest?.sleep_minutes == null ? null : formatMinutes(latest.sleep_minutes);
  const sleepRating = checkIn?.sleep == null ? null : sleepLabel(checkIn.sleep);
  const movementFacts = [
    latest?.exercise_minutes == null ? null : `${latest.exercise_minutes} exercise min`,
    latest?.steps == null ? null : `${latest.steps.toLocaleString("en-US")} steps`,
    latest?.active_energy_kcal == null ? null : `${Math.round(latest.active_energy_kcal).toLocaleString("en-US")} active kcal`,
  ].filter((fact): fact is string => fact != null);
  const weight = checkIn?.weight ?? latest?.weight_kg ?? null;
  const weightSummary = weight == null
    ? null
    : checkIn?.weight != null
      ? `${formatEnteredWeight(weight, weightUnit)} recorded in today’s check-in.`
      : `${formatConnectedWeight(weight, weightUnit)} shared from connected data.`;
  const feeling = checkIn?.energy == null ? null : energyLabel(checkIn.energy);
  const approvedLabSummary = labSummary?.memberApproved ? labSummary.summary.trim() : "";

  return {
    domains: [
      {
        key: "sleep",
        label: "Sleep",
        source: sourceFor(sleepRating != null, sleepDuration != null),
        sourceLabel: sourceLabel(sleepRating != null, sleepDuration != null),
        summary: sleepRating && sleepDuration
          ? `You described sleep as ${sleepRating.toLowerCase()}; connected data shows ${sleepDuration}.`
          : sleepRating
            ? `You described sleep as ${sleepRating.toLowerCase()}.`
            : sleepDuration
              ? `Connected data shows ${sleepDuration}. Add how it felt before LVE360 interprets the day.`
              : "No sleep context has been shared for today.",
      },
      {
        key: "movement",
        label: "Exercise",
        source: movementFacts.length ? "connected_data" : "limited",
        sourceLabel: movementFacts.length ? "Connected data" : "Needs context",
        summary: movementFacts.length
          ? `${movementFacts.join(" · ")}. LVE360 treats these as context, not a daily grade.`
          : "No activity summary has been shared. LVE360 will not guess from an incomplete day.",
      },
      {
        key: "nutrition_weight",
        label: "Diet & weight",
        source: weightSummary ? (checkIn?.weight != null ? "member_reported" : "connected_data") : "limited",
        sourceLabel: weightSummary ? (checkIn?.weight != null ? "Reported today" : "Connected data") : "Needs context",
        summary: weightSummary
          ? `${weightSummary} Food quality and eating context are never inferred from weight.`
          : "No weight or nutrition context has been shared. Food quality is never inferred from another signal.",
      },
      {
        key: "overall_feeling",
        label: "Overall feeling",
        source: feeling ? "member_reported" : "limited",
        sourceLabel: feeling ? "Reported today" : "Only you can share this",
        summary: feeling
          ? `You reported ${feeling.toLowerCase()} energy. Emotional wellbeing remains self-described, never inferred from activity or sleep.`
          : "LVE360 needs your own words or check-in before using emotional or mental-health context.",
      },
      {
        key: "lab_balance",
        label: "Lab balance",
        source: approvedLabSummary ? "lab_summary" : "limited",
        sourceLabel: approvedLabSummary ? "Approved lab summary" : "Needs verified results",
        summary: approvedLabSummary
          ? `${labSummary?.resultWindow ? `${labSummary.resultWindow}: ` : ""}${approvedLabSummary} This is context, not a diagnosis; review individual results with your healthcare provider.`
          : "No member-approved lab summary has been shared. Lab trends require collection dates, units, and the source laboratory’s reference ranges.",
      },
    ],
    guidance: checkIn
      ? "Your check-in stays the source of truth. Connected information can add context, but it never overrides how you say you feel."
      : "Connected information can describe what happened. LVE360 waits for your perspective before shaping today’s focus.",
  };
}

function sourceFor(reported: boolean, connected: boolean): HealthPictureSource {
  if (reported && connected) return "combined";
  if (reported) return "member_reported";
  if (connected) return "connected_data";
  return "limited";
}

function sourceLabel(reported: boolean, connected: boolean): string {
  if (reported && connected) return "Measured + reported";
  if (reported) return "Reported today";
  if (connected) return "Connected data";
  return "Needs context";
}

function sleepLabel(value: number): string {
  if (value <= 1) return "Very poor";
  if (value <= 2) return "Poor";
  if (value <= 3) return "Fair";
  if (value <= 4) return "Good";
  return "Restorative";
}

function energyLabel(value: number): string {
  if (value <= 1) return "Very low";
  if (value <= 3) return "Low";
  if (value <= 6) return "Steady";
  if (value <= 8) return "Good";
  return "High";
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function formatEnteredWeight(value: number, unit: "lb" | "kg"): string {
  if (unit === "kg") return `${(value * 0.45359237).toFixed(1)} kg`;
  return `${value.toFixed(1)} lb`;
}

function formatConnectedWeight(kilograms: number, unit: "lb" | "kg"): string {
  if (unit === "kg") return `${kilograms.toFixed(1)} kg`;
  return `${(kilograms * 2.2046226218).toFixed(1)} lb`;
}
