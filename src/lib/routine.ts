import type { RegimenInstructionAuthority } from "./medicationRecord.ts";
import {
  isRegimenScheduleDue,
  localDateString,
  regimenDoseSlots,
  regimenScheduleLabel,
  type RegimenSchedule,
} from "./regimenSchedule.ts";

export type RoutineItemKind = "medication" | "supplement" | "hormone" | "endocrine_active_supplement";
export type RoutineSourceType = "regimen" | "blueprint_proposal";

export type RoutineItem = {
  id: string;
  stack_id: string | null;
  name: string;
  brand: string | null;
  reorder_url: string | null;
  image_url: string | null;
  product_source: "fullscript" | "fallback" | "member" | null;
  product_sku: string | null;
  purpose: string | null;
  dose: string | null;
  timing: string | null;
  timing_text?: string | null;
  notes: string | null;
  item_kind: RoutineItemKind;
  instruction_source?: "intake" | "member_update" | "adopted_recommendation" | "manual_add" | null;
  instruction_authority?: RegimenInstructionAuthority | null;
  schedule?: RegimenSchedule | null;
  active?: boolean;
  is_current: boolean;
  source_type: RoutineSourceType;
  link_amazon: string | null;
  link_fullscript: string | null;
  refill_days_left: number | null;
  last_refilled_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const ROUTINE_SECTION_ORDER = [
  "medication",
  "hormone",
  "supplement",
  "endocrine_active_supplement",
] as const;

export const ROUTINE_SECTION_LABELS: Record<RoutineItemKind, string> = {
  medication: "Prescriptions",
  hormone: "Hormones",
  supplement: "Supplements",
  endocrine_active_supplement: "Hormone-active items",
};

export function groupRoutineItems(items: RoutineItem[]) {
  const current = items.filter((item) => item.source_type === "regimen" && item.is_current && item.active !== false);
  return {
    current,
    proposals: items.filter((item) => item.source_type === "blueprint_proposal"),
    byKind: Object.fromEntries(
      ROUTINE_SECTION_ORDER.map((kind) => [kind, current.filter((item) => item.item_kind === kind)])
    ) as Record<RoutineItemKind, RoutineItem[]>,
  };
}

export function routineScheduleLabel(item: Pick<RoutineItem, "timing" | "timing_text" | "schedule">): string {
  if (item.schedule) return regimenScheduleLabel(item.schedule);
  return item.timing?.trim() || item.timing_text?.trim() || "Schedule not recorded";
}

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function isRoutineItemDueToday(
  item: Pick<RoutineItem, "timing" | "timing_text" | "schedule">,
  today = new Date()
): boolean {
  if (item.schedule) return isRegimenScheduleDue(item.schedule, localDateString(today));
  const schedule = routineScheduleLabel(item).toLowerCase();
  if (schedule === "schedule not recorded" || /\b(as needed|prn)\b/.test(schedule)) return false;
  const namedDays = Object.entries(DAY_INDEX)
    .filter(([day]) => new RegExp(`\\b${day}(?:s)?\\b`, "i").test(schedule))
    .map(([, index]) => index);
  if (namedDays.length) return namedDays.includes(today.getDay());
  if (/\bweekly|once (?:a|per) week\b/.test(schedule)) return false;
  return true;
}

export function getRoutineTodaySummary(items: RoutineItem[], today = new Date()) {
  const { current, proposals } = groupRoutineItems(items);
  const date = localDateString(today);
  return {
    dueToday: current.reduce(
      (total, item) => total + (item.schedule ? regimenDoseSlots(item.schedule, date).length : 0),
      0,
    ),
    scheduleReview: current.filter((item) => !item.schedule).length,
    ideasToConsider: proposals.length,
  };
}

export function routineSourceLabel(source: RoutineItem["instruction_source"]): string {
  if (source === "member_update") return "Updated by you";
  if (source === "adopted_recommendation") return "Added from your Blueprint";
  if (source === "manual_add") return "Added by you";
  return "From your intake";
}

export function routineInstructionAuthorityLabel(authority: RoutineItem["instruction_authority"]): string | null {
  if (authority === "clinician") return "Instruction reported from your clinician or prescriber";
  if (authority === "pharmacist") return "Instruction reported from your pharmacist";
  if (authority === "medication_label") return "Instruction recorded from your medication label";
  if (authority === "product_label") return "Instruction recorded from your product label";
  return null;
}

export function isClinicianReviewProposal(item: Pick<RoutineItem, "notes">): boolean {
  return /clinician review|pharmacist|interaction|contraindicat|use caution|avoid/i.test(item.notes ?? "");
}
