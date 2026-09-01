import type { CurrentRegimenItem } from "@/lib/currentRegimenModel";

export type PlanRegimenGroup = {
  key: "medications" | "hormones" | "supplements";
  label: string;
  count: number;
  names: string[];
};

export type PlanScheduleCoverage = {
  structured: number;
  recordedTiming: number;
  needsStructure: number;
  asNeeded: number;
};

export function buildPlanRegimenGroups(items: CurrentRegimenItem[]): PlanRegimenGroup[] {
  const medications = items.filter((item) => item.item_kind === "medication");
  const hormones = items.filter((item) => item.item_kind === "hormone");
  const supplements = items.filter((item) =>
    item.item_kind === "supplement" || item.item_kind === "endocrine_active_supplement"
  );

  return [
    { key: "medications", label: "Medications", count: medications.length, names: previewNames(medications) },
    { key: "hormones", label: "Hormones", count: hormones.length, names: previewNames(hormones) },
    { key: "supplements", label: "Supplements", count: supplements.length, names: previewNames(supplements) },
  ];
}

export function buildPlanScheduleCoverage(items: CurrentRegimenItem[]): PlanScheduleCoverage {
  return items.reduce<PlanScheduleCoverage>((coverage, item) => {
    if (item.schedule) {
      coverage.structured += 1;
      if (item.schedule.cadence === "as_needed") coverage.asNeeded += 1;
    } else if (item.timing?.trim()) {
      coverage.recordedTiming += 1;
    } else {
      coverage.needsStructure += 1;
    }
    return coverage;
  }, { structured: 0, recordedTiming: 0, needsStructure: 0, asNeeded: 0 });
}

export function formatPlanChangeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function planChangeSourceLabel(source: string): string {
  if (source === "weekly_review") return "Weekly review";
  if (source === "blueprint") return "Blueprint";
  if (source === "onboarding") return "Practice setup";
  if (source === "coach") return "Ask LVE360";
  if (source === "system") return "LVE360";
  return "Member update";
}

function previewNames(items: CurrentRegimenItem[]): string[] {
  return items
    .map((item) => item.name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 4);
}
