import assert from "node:assert/strict";

import { doseIntegrityIssue } from "../lib/doseIntegrity.ts";
import { getRoutineTodaySummary, type RoutineItem } from "../lib/routine.ts";
import { canonicalRegimenTiming } from "../lib/regimenSchedule.ts";

const daily = { cadence: "daily" as const, times: ["10:30"], weekdays: [], interval_days: null, anchor_date: null };

assert.equal(
  canonicalRegimenTiming({ timing: "Daily at 6:00 AM", schedule: daily }),
  "Daily at 10:30 AM",
  "A structured schedule must win over stale written timing",
);
assert.equal(canonicalRegimenTiming({ timing: " PM ", schedule: null }), "PM");
assert.equal(doseIntegrityIssue("Vitamin D", "5000mg")?.code, "possible_unit_mismatch");
assert.equal(doseIntegrityIssue("Vitamin D3", "5000 IU"), null);
assert.equal(doseIntegrityIssue("Magnesium Glycinate", "400 mg"), null);

const base = {
  stack_id: null,
  brand: null,
  reorder_url: null,
  image_url: null,
  product_source: null,
  product_sku: null,
  purpose: null,
  notes: null,
  item_kind: "supplement" as const,
  instruction_source: "member_update" as const,
  instruction_authority: "product_label" as const,
  active: true,
  is_current: true,
  source_type: "regimen" as const,
  link_amazon: null,
  link_fullscript: null,
  refill_days_left: null,
  last_refilled_at: null,
};
const items: RoutineItem[] = [
  { ...base, id: "scheduled", name: "Vitamin D", dose: "5000 IU", timing: "6 AM", timing_text: "6 AM", schedule: daily },
  { ...base, id: "legacy", name: "Magnesium Glycinate", dose: "400 mg", timing: "PM", timing_text: "PM", schedule: null },
];
assert.deepEqual(getRoutineTodaySummary(items, new Date(2026, 7, 8)), {
  dueToday: 1,
  scheduleReview: 1,
  ideasToConsider: 0,
});

console.log("PR84 behavior assertions passed.");
