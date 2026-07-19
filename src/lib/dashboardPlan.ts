import { isEndocrineActiveSupplementName, isMedicationOrHormoneName } from "@/src/lib/supplementEligibility";

export type DashboardPlanInput = {
  name?: string | null;
  dose?: string | null;
  timing?: string | null;
  timing_text?: string | null;
  timing_bucket?: string | null;
  notes?: string | null;
  is_current?: boolean | null;
};

export function getDashboardItemKind(name?: string | null) {
  if (isEndocrineActiveSupplementName(name)) return "endocrine_active_supplement" as const;
  if (isMedicationOrHormoneName(name)) return "medication_or_hormone" as const;
  return "supplement" as const;
}

export function isPendingRecommendation(item: DashboardPlanInput): boolean {
  if (item.is_current === true) return false;
  if (/Blueprint status:\s*(?:New\s*[-–—]\s*consider|Clinician review)/i.test(item.notes ?? "")) return true;
  return item.is_current === false;
}

export function getDashboardSchedule(item: DashboardPlanInput) {
  const signal = [item.timing_bucket, item.timing, item.timing_text, item.dose, item.notes]
    .filter(Boolean).join(" ").toLowerCase();
  if (/\b(as needed|prn)\b/.test(signal)) return "AS_NEEDED" as const;
  if (/\b(weekly|once a week|1x\s*(?:a|per)?\s*week)\b/.test(signal)) return "WEEKLY" as const;
  const am = /\b(am|morning|breakfast)\b/.test(signal);
  const pm = /\b(pm|evening|night|bedtime)\b/.test(signal);
  if ((am && pm) || /\b(am\/pm|twice|bid|split)\b/.test(signal)) return "AM/PM" as const;
  if (am) return "AM" as const;
  if (pm) return "PM" as const;
  if (/\b(daily|anytime|with (?:a )?(?:meal|food))\b/.test(signal)) return "ANYTIME" as const;
  return "UNSCHEDULED" as const;
}

export function isBatchTrackable(item: DashboardPlanInput): boolean {
  const schedule = getDashboardSchedule(item);
  return !isPendingRecommendation(item) && getDashboardItemKind(item.name) === "supplement" &&
    !["WEEKLY", "AS_NEEDED", "UNSCHEDULED"].includes(schedule);
}

export function cleanDashboardDose(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\*\*/g, "").replace(/^\s*[:;–—-]+\s*/, "")
    .replace(/\bevidence\s*:\s*informed\b/gi, "evidence-informed")
    .replace(/\blabel\s*:\s*directed\b/gi, "label-directed")
    .replace(/(\d)\s*:\s*(\d)/g, "$1–$2").replace(/\s+/g, " ").trim();
  return cleaned || null;
}
