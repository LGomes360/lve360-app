import assert from "node:assert/strict";

import {
  getRoutineTodaySummary,
  groupRoutineItems,
  isClinicianReviewProposal,
  isRoutineItemDueToday,
  routineScheduleLabel,
  type RoutineItem,
} from "../lib/routine.ts";

function item(overrides: Partial<RoutineItem>): RoutineItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    stack_id: null,
    name: "Example",
    brand: null,
    purpose: null,
    dose: null,
    timing: null,
    notes: null,
    item_kind: "supplement",
    instruction_source: "intake",
    active: true,
    is_current: true,
    source_type: "regimen",
    link_amazon: null,
    link_fullscript: null,
    refill_days_left: null,
    last_refilled_at: null,
    ...overrides,
  };
}

const regimen = [
  item({ id: "med", name: "Metformin", item_kind: "medication", timing: "Morning with breakfast", schedule: { cadence: "daily", times: ["08:00"], weekdays: [], interval_days: null, anchor_date: null } }),
  item({ id: "hormone", name: "Testosterone", item_kind: "hormone", timing: "Monday and Thursday evenings", schedule: { cadence: "weekdays", times: ["20:00"], weekdays: [1, 4], interval_days: null, anchor_date: null } }),
  item({ id: "supplement", name: "Magnesium Threonate", item_kind: "supplement", timing: "Before bed" }),
  item({ id: "active", name: "DHEA", item_kind: "endocrine_active_supplement", timing: null, schedule: { cadence: "as_needed", times: [], weekdays: [], interval_days: null, anchor_date: null } }),
  item({ id: "idea", name: "Berberine", source_type: "blueprint_proposal", is_current: true, active: false, notes: "Clinician review" }),
];

const grouped = groupRoutineItems(regimen);
assert.deepEqual(grouped.byKind.medication.map(({ id }) => id), ["med"]);
assert.deepEqual(grouped.byKind.hormone.map(({ id }) => id), ["hormone"]);
assert.deepEqual(grouped.byKind.supplement.map(({ id }) => id), ["supplement"]);
assert.deepEqual(grouped.byKind.endocrine_active_supplement.map(({ id }) => id), ["active"]);
assert.equal(grouped.current.some(({ id }) => id === "idea"), false, "A proposal must never appear current even if a historical flag says otherwise");
assert.deepEqual(grouped.proposals.map(({ id }) => id), ["idea"]);

assert.equal(routineScheduleLabel(regimen[2]), "Before bed", "Legacy text remains visible until a structured schedule is recorded");
assert.equal(routineScheduleLabel(item({ timing: null })), "Schedule not recorded");
assert.equal(routineScheduleLabel(regimen[0]), "Daily at 8:00 AM", "Structured timing must override legacy text");
assert.equal(isRoutineItemDueToday(regimen[0], new Date(2026, 7, 3)), true);
assert.equal(isRoutineItemDueToday(regimen[1], new Date(2026, 7, 3)), true, "Monday hormone schedule should be due Monday");
assert.equal(isRoutineItemDueToday(regimen[1], new Date(2026, 7, 4)), false, "Monday/Thursday hormone schedule should not be due Tuesday");
assert.equal(isRoutineItemDueToday(item({ timing: "As needed" }), new Date(2026, 7, 3)), false);
assert.equal(isClinicianReviewProposal(regimen[4]), true);

assert.deepEqual(getRoutineTodaySummary(regimen, new Date(2026, 7, 3)), {
  dueToday: 2,
  scheduleReview: 1,
  ideasToConsider: 1,
});

console.log("Routine assertions passed");
