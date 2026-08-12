import assert from "node:assert/strict";

import { clinicianRoutineQuestions } from "../lib/clinicianRoutineSummary.ts";
import { addRoutineScheduleContext, buildRoutineCopilotProposal } from "../lib/routineCopilot.ts";
import type { RoutineItem } from "../lib/routine.ts";

const weekly = buildRoutineCopilotProposal({
  sourceText: "Zepbound 10 mg / 0.5 mL once weekly on Sunday at 8:00 AM",
  kind: "medication",
  extraction: {
    name_quote: "Zepbound",
    dose_quote: "10 mg / 0.5 mL",
    schedule_quote: "once weekly on Sunday at 8:00 AM",
  },
});
assert.equal(weekly.name, "Zepbound");
assert.equal(weekly.dose, "10 mg / 0.5 mL");
assert.deepEqual(weekly.schedule, {
  cadence: "weekly",
  times: ["08:00"],
  weekdays: [0],
  interval_days: null,
  anchor_date: null,
});
assert.deepEqual(weekly.missingFields, []);

const vague = buildRoutineCopilotProposal({
  sourceText: "Magnesium glycinate 2 capsules in the evening",
  kind: "supplement",
  extraction: {
    name_quote: "Magnesium glycinate",
    dose_quote: "2 capsules",
    schedule_quote: "in the evening",
  },
});
assert.equal(vague.schedule, null);
assert.match(vague.questions.join(" "), /exact clock time/i);

const everyFewDays = buildRoutineCopilotProposal({
  sourceText: "Take 1 tablet every 2 days at 7 AM",
  kind: "medication",
  extraction: { dose_quote: "1 tablet", schedule_quote: "every 2 days at 7 AM" },
});
assert.equal(everyFewDays.schedule, null);
assert.match(everyFewDays.questions.join(" "), /starting date/i);

const protectedAgainstInvention = buildRoutineCopilotProposal({
  sourceText: "Take 5 mg daily at 9 PM",
  kind: "medication",
  extraction: { name_quote: "Invented drug", dose_quote: "20 mg", schedule_quote: "daily at 8 AM" },
});
assert.equal(protectedAgainstInvention.name, null);
assert.equal(protectedAgainstInvention.dose, "5 mg");
assert.equal(protectedAgainstInvention.timing, "Take 5 mg daily at 9 PM");
assert.equal(protectedAgainstInvention.schedule?.times[0], "21:00");

const contextual = addRoutineScheduleContext(weekly, [{
  name: "Existing item",
  schedule: { cadence: "daily", times: ["08:00"], weekdays: [], interval_days: null, anchor_date: null },
}]);
assert.match(contextual.explanation, /organization note, not an interaction or safety assessment/i);

const baseItem: RoutineItem = {
  id: "item-1",
  stack_id: null,
  name: "Recorded medication",
  brand: null,
  reorder_url: null,
  image_url: null,
  product_source: "member",
  product_sku: null,
  purpose: null,
  dose: null,
  timing: null,
  notes: null,
  item_kind: "medication",
  instruction_source: "member_update",
  instruction_authority: null,
  schedule: null,
  active: true,
  is_current: true,
  source_type: "regimen",
  link_amazon: null,
  link_fullscript: null,
  refill_days_left: null,
  last_refilled_at: null,
};
const questions = clinicianRoutineQuestions([baseItem]).map((item) => item.question).join(" ");
assert.match(questions, /amount and unit/i);
assert.match(questions, /cadence/i);
assert.match(questions, /instruction came from/i);

console.log("PR102 Routine Copilot behavior assertions passed.");
