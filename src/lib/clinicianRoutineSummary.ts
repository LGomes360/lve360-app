import { doseIntegrityIssue } from "./doseIntegrity.ts";
import type { RoutineItem } from "./routine.ts";

export type ClinicianRoutineQuestion = {
  itemId: string;
  itemName: string;
  question: string;
};

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
