import assert from "node:assert/strict";

import {
  fallbackDailyIntentionSuggestions,
  parseDailyIntentionSuggestions,
  validateDailyIntention,
} from "../lib/dailyIntention.ts";

const direct = validateDailyIntention("I choose calm focus today");
assert.equal(direct.ok, true);
if (direct.ok) assert.equal(direct.phrase, "I choose calm focus today.");

const fragment = validateDailyIntention("calm and present");
assert.equal(fragment.ok, true, "a short positive fragment should become an identity statement");
if (fragment.ok) assert.equal(fragment.phrase, "I choose calm and present today.");

assert.deepEqual(validateDailyIntention("I need to finish a spreadsheet"), { ok: false, error: "task_or_metric" });
assert.deepEqual(validateDailyIntention("I won't procrastinate today"), { ok: false, error: "negative" });
assert.deepEqual(validateDailyIntention("I will walk 10,000 steps"), { ok: false, error: "task_or_metric" });
assert.deepEqual(validateDailyIntention("I choose to bring a deeply patient calm curious open generous focused spirit today"), { ok: false, error: "too_long" });

const repaired = parseDailyIntentionSuggestions({
  suggestions: [
    { focus_word: "Clarity", phrase: "I bring calm clarity to today" },
    { focus_word: "Output", phrase: "I need to finish three tasks" },
    { focus_word: "Clarity", phrase: "I bring calm clarity to today" },
  ],
}, "focus");
assert.equal(repaired.length, 3, "invalid and duplicate model options must be replaced with safe defaults");
assert.ok(repaired.every((item) => validateDailyIntention(item.phrase).ok));
assert.equal(new Set(repaired.map((item) => item.phrase.toLowerCase())).size, 3);

for (const direction of ["movement", "nutrition", "sleep", "emotional_health", "relationships", "focus", "career", "happiness", "overall_health"]) {
  const suggestions = fallbackDailyIntentionSuggestions(direction);
  assert.equal(suggestions.length, 3);
  assert.ok(suggestions.every((item) => validateDailyIntention(item.phrase).ok), `${direction} fallbacks must pass the behavioral linter`);
}

console.log("PR126 daily intention behavioral assertions passed.");
