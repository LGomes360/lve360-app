import assert from "node:assert/strict";

import { completionCount, isCompletionKind, parseLocalDate, weekBounds } from "../lib/today";

const now = new Date("2026-07-21T23:30:00.000Z");

assert.equal(parseLocalDate("2026-07-21", now), "2026-07-21");
assert.equal(parseLocalDate("2026-07-20", now), "2026-07-20");
assert.equal(parseLocalDate("2026-07-22", now), "2026-07-22");
assert.equal(parseLocalDate("2026-07-19", now), null);
assert.equal(parseLocalDate("07/21/2026", now), null);
assert.equal(parseLocalDate("2026-02-30", now), null);

assert.equal(isCompletionKind("full"), true);
assert.equal(isCompletionKind("minimum"), true);
assert.equal(isCompletionKind("skipped"), false);

assert.deepEqual(weekBounds("2026-07-21"), {
  start: "2026-07-20",
  end: "2026-07-26",
  days: [
    "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
    "2026-07-24", "2026-07-25", "2026-07-26",
  ],
});

assert.equal(completionCount([
  { completion_date: "2026-07-20", completion_kind: "minimum" },
  { completion_date: "2026-07-20", completion_kind: "full" },
  { completion_date: "2026-07-21", completion_kind: "full" },
]), 2);

console.log("today assertions passed");
