import { doseIntegrityIssue } from "./doseIntegrity.ts";
import type { RoutineItem } from "./routine.ts";

export type ClinicianRoutineChange = {
  itemId: string;
  itemName: string;
  description: string;
};

export type ClinicianRoutineQuestion = {
  itemId: string;
  itemName: string;
  question: string;
};

export function clinicianRoutineChanges(items: RoutineItem[]): ClinicianRoutineChange[] {
  return items.flatMap((item) => {
    if (item.instruction_source === "manual_add") {
      return [{ itemId: item.id, itemName: item.name, description: "Member reports adding this item to their current record." }];
    }
    if (item.instruction_source === "member_update") {
      return [{ itemId: item.id, itemName: item.name, description: "Member reports updating the dose, schedule, or product details in this record." }];
    }
    return [];
  });
}
export function clinicianRoutineQuestions(items: RoutineItem[]): ClinicianRoutineQuestion[] {
  return items.flatMap((item) => {
    const questions: ClinicianRoutineQuestion[] = [];
    const push = (question: string) => questions.push({ itemId: item.id, itemName: item.name, question });
    const prescribed = item.item_kind === "medication" || item.item_kind === "hormone";
    if (!item.dose?.trim()) push("Confirm the amount and unit taken at each scheduled time.");
    if (!item.schedule) push("Confirm the cadence, applicable days, and exact checklist times.");
    if (prescribed && !item.instruction_authority) push("Confirm where the current prescription instruction came from.");
    const issue = doseIntegrityIssue(item.name, item.dose);
    if (issue) push(`Review the member-entered amount and unit. ${issue.message}`);
    if (item.schedule && item.schedule.times.length > 1 && item.dose?.trim()) {
      push("Confirm that the recorded amount applies at each listed time rather than representing a full-day total.");
    }
    return questions;
  });
}
