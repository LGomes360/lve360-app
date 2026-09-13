import assert from "node:assert/strict";

import {
  attachCoachPersonalizationReceipt,
  buildCoachPersonalizationReceipt,
  coachPersonalizationFromSources,
  isExcludableCoachContextId,
} from "../lib/coachPersonalization.ts";
import type { CoachSource } from "../lib/contextualCoach.ts";

const sources: CoachSource[] = [
  {
    id: "recent_check_ins",
    label: "Recent check-ins",
    summary: "Three recent check-ins, including member-reported context.",
    href: "/settings#personalization-context",
    kind: "member_record",
  },
  {
    id: "evidence_sleep",
    label: "Sleep evidence",
    summary: "Maintained evidence summary.",
    href: "https://example.com",
    kind: "evidence",
  },
];

const receipt = buildCoachPersonalizationReceipt({
  intent: "PERSONALIZED_RECOMMENDATION",
  answer: "Try one small adjustment.\n\nExperiment: 14 days; track sleep quality, morning energy.\n\nNext step: Notice what changes.",
  sources,
});

assert(receipt, "personalized answers grounded in member records should receive a receipt");
assert.match(receipt.whyNow, /Recent check-ins/);
assert.equal(receipt.expectedSignal, "Notice what changes in sleep quality, morning energy.");
assert.equal(receipt.reviewTiming, "Review after 14 days.");
assert.equal(receipt.noAutomaticChanges, true);
assert.deepEqual(receipt.sourceIds, ["recent_check_ins"]);

const attached = attachCoachPersonalizationReceipt(sources, receipt);
assert.deepEqual(coachPersonalizationFromSources(attached), receipt, "receipt should survive source_refs persistence");
assert.equal(sources[0]?.personalization_receipt, undefined, "attachment must not mutate the original source list");

assert.equal(isExcludableCoachContextId("recent_check_ins"), true);
assert.equal(isExcludableCoachContextId("current_routine"), false, "core Routine context cannot be excluded from safety-aware answers");
assert.equal(isExcludableCoachContextId("health_profile"), false, "core health context cannot be excluded from safety-aware answers");

assert.equal(buildCoachPersonalizationReceipt({
  intent: "GENERAL_EDUCATION",
  answer: "General educational answer.",
  sources,
}), null, "general education should not pretend to be personalized");

console.log("PR175 progressive personalization assertions passed.");
