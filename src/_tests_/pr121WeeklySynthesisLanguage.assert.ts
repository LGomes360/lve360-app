import assert from "node:assert/strict";

import { hypothesisSupportsDecision, normalizeMemberVoice, usesDirectMemberVoice } from "../lib/weeklySynthesisLanguage.ts";

assert.equal(
  usesDirectMemberVoice(
    "You completed 3 of your 5 planned repetitions this week.",
    "Repeating your current version for another week may show whether it becomes more consistent.",
  ),
  true,
  "A direct, supportive reflection should be accepted.",
);

assert.equal(
  usesDirectMemberVoice(
    "You have an early signal from one recorded repetition.",
    "Your current version may be workable. Repeating it for another week would test that fit.",
  ),
  true,
  "The deterministic fallback must also address the member directly.",
);

assert.equal(
  usesDirectMemberVoice(
    "The member completed 3 of 5 repetitions.",
    "They may benefit from another week.",
  ),
  false,
  "Third-person product language should be rejected.",
);

assert.equal(
  hypothesisSupportsDecision(
    "Repeating your current version for another week may show whether it becomes more consistent.",
    "keep",
  ),
  true,
  "A keep hypothesis should reinforce the current version.",
);

assert.equal(
  normalizeMemberVoice("The member completed 3 of 5 repetitions.", "observation"),
  "You completed 3 of 5 repetitions.",
  "Safe third-person model wording should be made member-facing without changing the fact.",
);

assert.equal(
  normalizeMemberVoice("Repeating the current version may show whether it fits.", "hypothesis"),
  "For your next week, repeating the current version may show whether it fits.",
  "A safe hypothesis without a pronoun should receive a direct member-facing frame.",
);

assert.equal(
  hypothesisSupportsDecision(
    "Repeating your current version without changing it may show whether the fit is consistent.",
    "keep",
  ),
  true,
  "Negated change language must not be mistaken for a contradictory recommendation.",
);

assert.equal(
  hypothesisSupportsDecision(
    "Adjusting your planned repetitions or changing the practice may improve completion.",
    "keep",
  ),
  false,
  "A keep recommendation must not be paired with a contradictory change hypothesis.",
);

for (const [decision, hypothesis] of [
  ["shrink", "Trying a smaller version of your practice may make it easier to repeat."],
  ["swap", "Trying a different practice may help you find a better fit."],
  ["pause", "Taking a pause may help you decide whether another priority deserves your attention."],
  ["advance", "A small increase may help you test whether your practice can grow comfortably."],
] as const) {
  assert.equal(hypothesisSupportsDecision(hypothesis, decision), true, `${decision} language should align.`);
}

console.log("PR121 weekly synthesis language checks passed.");
