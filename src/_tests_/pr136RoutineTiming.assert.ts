import assert from "node:assert/strict";

import {
  earlierUnrecordedOccurrences,
  nextUpcomingOccurrence,
  unrecordedOccurrencesAtOrBefore,
  type RegimenDoseOccurrence,
} from "../lib/regimenDose.ts";
import { localClock } from "../lib/reminderSchedule.ts";

function occurrence(time: string, status: RegimenDoseOccurrence["status"] = null): RegimenDoseOccurrence {
  return {
    eventId: status ? `event-${time}` : null,
    regimenItemId: `item-${time}`,
    itemName: `Item ${time}`,
    itemKind: "supplement",
    dose: "1 capsule",
    date: "2026-08-27",
    slotKey: time,
    time,
    timeLabel: time,
    status,
  };
}

const morning = [occurrence("06:00"), occurrence("08:30"), occurrence("10:30")];

assert.deepEqual(
  unrecordedOccurrencesAtOrBefore(morning, 9 * 60).map((item) => item.time),
  ["06:00", "08:30"],
  "Bulk completion must exclude a 10:30 item at 9:00",
);
assert.deepEqual(
  unrecordedOccurrencesAtOrBefore(morning, 10 * 60 + 30).map((item) => item.time),
  ["06:00", "08:30", "10:30"],
  "An occurrence must become bulk-recordable when its scheduled time arrives",
);
assert.deepEqual(
  earlierUnrecordedOccurrences(morning, 9 * 60).map((item) => item.time),
  ["06:00", "08:30"],
  "Today must identify earlier scheduled items without including the next upcoming item",
);
assert.equal(
  nextUpcomingOccurrence(morning, 9 * 60)?.time,
  "10:30",
  "Today must show the next upcoming occurrence instead of wrapping to an earlier item",
);
assert.equal(
  nextUpcomingOccurrence([occurrence("06:00"), occurrence("08:30")], 9 * 60),
  null,
  "Today must not present an earlier unrecorded occurrence as the next upcoming item",
);
assert.deepEqual(
  unrecordedOccurrencesAtOrBefore([occurrence("06:00", "taken"), occurrence("08:30")], 9 * 60).map((item) => item.time),
  ["08:30"],
  "Recorded occurrences must not be included in a bulk action",
);

assert.deepEqual(
  localClock(new Date("2026-08-27T15:05:00.000Z"), "America/Denver"),
  { date: "2026-08-27", hour: 9, minute: 5 },
  "Routine timing must use the member's saved timezone",
);

console.log("PR136 routine timing assertions passed.");
