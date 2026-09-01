import assert from "node:assert/strict";

import {
  journeyChangeDetails,
  journeyPlanChangeForReview,
  type JourneyPlanChange,
  type JourneyReview,
} from "../lib/journey.ts";
import { formatPracticeQuantity } from "../lib/practiceQuantity.ts";
import { journeySynthesisGrounding } from "../lib/journeyGrounding.ts";

assert.equal(formatPracticeQuantity(1, "minutes"), "1 minute");
assert.equal(formatPracticeQuantity(3, "minute"), "3 minutes");
assert.equal(formatPracticeQuantity(500, "mg"), "500 mg");

const grounding = journeySynthesisGrounding({
  experiment: { action_label: "Wall sit for 1 minute." },
  review: { completion_count: 3, target_count: 5, difficulty: 4, value_rating: 3 },
  synthesis: {
    confidence: "moderate",
    evidence: [
      { label: "Practice completions", value: "3 of 5 planned" },
      { label: "Exercise volume", value: "3 minute" },
    ],
  },
  connection: null,
  blueprintContext: null,
});
assert.match(
  grounding.sources[0]?.detail ?? "",
  /Exercise volume: 3 minutes/,
  "Legacy evidence quantities should use the same human-readable grammar as the weekly story.",
);

const review: JourneyReview = {
  experiment_id: "experiment-1",
  next_experiment_id: "experiment-2",
  completion_count: 3,
  target_count: 4,
  target_quantity_per_session: null,
  quantity_unit: null,
  known_total_quantity: null,
  known_total_quantity_unit: null,
  difficulty: 2,
  value_rating: 4,
  decision: "keep",
  adaptation_kind: "modify",
  adaptation_rationale: "The morning cue was easier to remember.",
  status: "completed",
  completed_at: "2026-08-31T18:00:00.000Z",
};

const unrelatedChange = planChange({
  id: "change-1",
  source_record_id: "experiment-other",
});
const linkedChange = planChange({
  id: "change-2",
  source_record_id: "experiment-1",
  change_summary: "Modified one minute of breathing",
  before_state: {
    action_label: "Take two minutes for a breathing reset",
    cue: "After lunch",
    frequency_per_week: 4,
    status: "active",
  },
  after_state: {
    action_label: "Take one minute for a breathing reset",
    cue: "After breakfast",
    frequency_per_week: 5,
    status: "active",
  },
});

assert.equal(
  journeyPlanChangeForReview(review, [unrelatedChange, linkedChange])?.id,
  "change-2",
  "A weekly story must use the canonical change event tied to that exact review.",
);
assert.equal(journeyPlanChangeForReview(null, [linkedChange]), null);

assert.deepEqual(journeyChangeDetails(linkedChange), [
  {
    label: "Practice",
    before: "Take two minutes for a breathing reset",
    after: "Take one minute for a breathing reset",
  },
  { label: "Cue", before: "After lunch", after: "After breakfast" },
  { label: "Weekly target", before: "4 times per week", after: "5 times per week" },
]);

const regimenChange = planChange({
  domain: "regimen",
  entity_type: "medication",
  change_type: "updated",
  before_state: { name: "Example medication", dose: "5 mg", active: true },
  after_state: { name: "Example medication", dose: "10 mg", active: true },
});
assert.deepEqual(journeyChangeDetails(regimenChange), [
  { label: "Dose", before: "5 mg", after: "10 mg" },
]);

function planChange(overrides: Partial<JourneyPlanChange> = {}): JourneyPlanChange {
  return {
    id: "change",
    domain: "practice",
    entity_type: "practice",
    entity_id: "practice-1",
    change_type: "modify",
    source: "weekly_review",
    change_summary: "Modified practice",
    before_state: null,
    after_state: null,
    source_record_type: "weekly_experiment",
    source_record_id: "experiment-1",
    created_at: "2026-08-31T18:00:00.000Z",
    ...overrides,
  };
}

console.log("PR160 Journey change intelligence assertions passed.");
