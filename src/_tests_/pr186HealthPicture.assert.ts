import assert from "node:assert/strict";

import { buildHealthPicture } from "../lib/healthPicture.ts";
import type { ConnectedHealthSummary } from "../lib/connectedHealth.ts";

const connected: ConnectedHealthSummary = {
  provider: "apple_health",
  status: "connected",
  requestedDataTypes: ["steps", "sleep", "weight", "exercise_time"],
  lastSyncCompletedAt: "2026-09-26T21:00:00.000Z",
  latest: {
    local_date: "2026-09-26",
    time_zone: "America/Denver",
    steps: 5420,
    sleep_minutes: 425,
    resting_heart_rate: null,
    weight_kg: 90.7,
    active_energy_kcal: null,
    exercise_minutes: 28,
    source_updated_at: "2026-09-26T20:50:00.000Z",
  },
};

const picture = buildHealthPicture({
  connectedHealth: connected,
  checkIn: { sleep: 4, energy: 5, weight: null },
  weightUnit: "lb",
});

assert.equal(picture.domains.length, 4);
assert.equal(picture.domains[0].source, "combined", "sleep should distinguish measured and reported context");
assert.match(picture.domains[0].summary, /You described sleep as good/i);
assert.match(picture.domains[1].summary, /5,420 steps/);
assert.match(picture.domains[2].summary, /Food quality and eating context are never inferred from weight/);
assert.equal(picture.domains[3].source, "member_reported", "overall feeling must come from the member check-in");
assert.match(picture.domains[3].summary, /Emotional wellbeing remains self-described/);

const connectedOnly = buildHealthPicture({ connectedHealth: connected, checkIn: null, weightUnit: "kg" });
assert.equal(connectedOnly.domains[3].source, "limited", "activity and sleep must not infer emotional wellbeing");
assert.match(connectedOnly.domains[3].summary, /your own words or check-in/i);

const kilograms = buildHealthPicture({
  connectedHealth: null,
  checkIn: { sleep: 3, energy: 5, weight: 200 },
  weightUnit: "kg",
});
assert.match(kilograms.domains[2].summary, /90\.7 kg/, "check-in weight is stored in pounds and must follow the member display preference");

console.log("PR186 health-picture assertions passed.");
