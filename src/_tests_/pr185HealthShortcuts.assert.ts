import assert from "node:assert/strict";

import { chooseConnectedHealthProvider } from "../lib/connectedHealth.ts";
import { localDateInTimeZone, parseHealthShortcutMeasurement, parseHealthShortcutTypes } from "../lib/healthShortcuts.ts";

const now = new Date("2026-09-19T06:30:00.000Z");
const zone = "America/Denver";

assert.equal(localDateInTimeZone(now, zone), "2026-09-19");
assert.equal(chooseConnectedHealthProvider([
  { provider: "apple_health", status: "disconnected", hasMetrics: true },
  { provider: "apple_health_shortcuts", status: "connected", hasMetrics: true },
]), "apple_health_shortcuts", "a disconnected native source must not hide an active Shortcut");
assert.equal(chooseConnectedHealthProvider([
  { provider: "apple_health", status: "connected", hasMetrics: true },
  { provider: "apple_health_shortcuts", status: "connected", hasMetrics: true },
]), "apple_health", "native data takes precedence if both sources are active");
assert.equal(chooseConnectedHealthProvider([
  { provider: "apple_health", status: "connected", hasMetrics: false },
  { provider: "apple_health_shortcuts", status: "connected", hasMetrics: true },
]), "apple_health_shortcuts", "a native connection without data must not hide a Shortcut summary");
assert.deepEqual(parseHealthShortcutTypes(["steps", "weight"]), ["steps", "weight"]);
assert.equal(parseHealthShortcutTypes(["steps", "steps"]), null);
assert.equal(parseHealthShortcutTypes(["steps", "clinical_records"]), null);

const steps = parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: "8421" }, ["steps"], zone, now);
assert.deepEqual(steps, {
  localDate: "2026-09-19",
  timeZone: zone,
  type: "steps",
  column: "steps",
  value: 8421,
});

const weight = parseHealthShortcutMeasurement({ type: "weight", unit: "lb", value: 200, local_date: "2026-09-18" }, ["weight"], zone, now);
assert.equal(weight?.column, "weight_kg");
assert.equal(weight?.value, 90.718);

assert.equal(parseHealthShortcutMeasurement({ type: "weight", unit: "lb", value: 200 }, ["steps"], zone, now), null, "token scope must bind each accepted category");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "lb", value: 10 }, ["steps"], zone, now), null, "incompatible units must be rejected");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: -5 }, ["steps"], zone, now), null, "negative values must be rejected");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: 8.5 }, ["steps"], zone, now), null, "counts must be whole numbers");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: 500001 }, ["steps"], zone, now), null, "implausible values must be rejected");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: 10, local_date: "2026-09-20" }, ["steps"], zone, now), null, "future dates must be rejected");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: 10, local_date: "2026-08-18" }, ["steps"], zone, now), null, "old dates must be rejected");
assert.equal(parseHealthShortcutMeasurement({ type: "steps", unit: "count", value: 10 }, ["steps"], "Not/AZone", now), null, "invalid timezone must fail closed");

console.log("PR185 Health Shortcuts payload assertions passed.");
