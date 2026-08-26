import assert from "node:assert/strict";

import {
  DAILY_INTENTION_PROMPT_VERSION,
  fallbackDailyIntentionSuggestions,
  parseDailyIntentionSuggestions,
  validateDailyIntention,
  type DailyIntentionPersonalization,
} from "../lib/dailyIntention.ts";

assert.equal(DAILY_INTENTION_PROMPT_VERSION, "daily-intention-v2");

const personalization: DailyIntentionPersonalization = {
  groundingReasons: {
    active_practice: "Connected to this week's practice: Wall sit for one minute.",
    recent_check_in: "Uses the recent sleep and energy signals you chose to record.",
    identity_direction: "Matches the identity you chose for this week: Someone who keeps promises to their health.",
  },
  excludedPhrases: ["I approach today with calm clarity."],
  requiredGroundingKeys: ["active_practice", "recent_check_in", "identity_direction"],
};

const personalized = parseDailyIntentionSuggestions({
  suggestions: [
    {
      focus_word: "Patience",
      phrase: "I bring patient focus to today",
      grounding_key: "active_practice",
      why_this_fits: "An invented model explanation must not reach the member.",
    },
    {
      focus_word: "Clarity",
      phrase: "I approach today with calm clarity",
      grounding_key: "recent_check_in",
    },
    {
      focus_word: "Steadiness",
      phrase: "I meet today with steady self-respect",
      grounding_key: "recent_check_in",
    },
    {
      focus_word: "Purpose",
      phrase: "I act with purpose and steady focus today",
      grounding_key: "today_context",
    },
  ],
}, "focus", personalization);

assert.equal(personalized.length, 3, "personalized generation must still return exactly three safe choices");
assert.ok(personalized.every((item) => validateDailyIntention(item.phrase).ok));
assert.ok(!personalized.some((item) => item.phrase === "I approach today with calm clarity."), "recent intentions should not be repeated");
assert.ok(!personalized.some((item) => item.groundingKey === "today_context"), "an unavailable grounding source must be rejected");
assert.deepEqual(
  new Set(personalized.map((item) => item.groundingKey)),
  new Set(personalization.requiredGroundingKeys),
  "each strongest available grounding source should appear exactly once",
);
assert.equal(
  personalized.find((item) => item.groundingKey === "active_practice")?.whyThisFits,
  personalization.groundingReasons?.active_practice,
  "the member-facing reason must come from deterministic saved context rather than model prose",
);

const firstFallbackSet = fallbackDailyIntentionSuggestions("focus", personalization);
const rotatedFallbackSet = fallbackDailyIntentionSuggestions("focus", {
  ...personalization,
  excludedPhrases: firstFallbackSet.map((item) => item.phrase),
});
assert.equal(rotatedFallbackSet.length, 3);
assert.ok(rotatedFallbackSet.every((item) => item.whyThisFits.length > 0));
assert.deepEqual(
  new Set(rotatedFallbackSet.map((item) => item.groundingKey)),
  new Set(personalization.requiredGroundingKeys),
  "deterministic fallbacks should preserve grounding diversity",
);
assert.ok(rotatedFallbackSet.every((item) => !firstFallbackSet.some((prior) => prior.phrase === item.phrase)), "fallbacks should rotate away from recent choices when possible");

const restored = parseDailyIntentionSuggestions({
  suggestions: [{
    focus_word: "Care",
    phrase: "I bring steady care to today",
    grounding_key: "saved_goal",
    why_this_fits: "Connected to your saved goal: Improve daily energy.",
  }],
});
assert.equal(restored[0]?.whyThisFits, "Connected to your saved goal: Improve daily energy.", "stored deterministic reasons should survive a later record load");

console.log("PR134 personalized daily intention assertions passed.");
