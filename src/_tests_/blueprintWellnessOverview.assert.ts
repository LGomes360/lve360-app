import assert from "node:assert/strict";

import { buildBlueprintWellnessOverview, blueprintOverviewLocalDate, blueprintWellnessIntroMarkdown } from "../lib/blueprintWellnessOverview.ts";
import type { ConnectedHealthSummary } from "../lib/connectedHealth.ts";
import type { ApprovedHealthContextHandoff } from "../lib/healthContextHandoff.ts";
import type { ImportedHealthSummary } from "../lib/importedHealthContext.ts";
import { healthItemIdentityKey } from "../lib/healthItemIdentity.ts";
import { classifyBlueprintRecommendation, recommendationOverlapNames, reconcileBlueprintRecommendationBody } from "../lib/recommendationDecision.ts";
import { extractReportRecommendationProposals } from "../lib/reportRecommendationProposals.ts";

// Synthetic examples only; never copy member records into fixtures.
const day = "2026-10-04";
const empty = buildBlueprintWellnessOverview({ asOfDate: day });
assert.deepEqual(empty.areas.map((area) => area.key), ["sleep", "exercise", "diet_weight", "overall_feeling", "lab_balance"]);
assert(empty.areas.every((area) => area.records.length === 0));
assert.match(empty.areas[0].today, /not established/);
assert.match(empty.areas[3].today, /not established/);
assert.match(empty.routineNote, /Nothing is added, stopped or acknowledged/);

const archive: ImportedHealthSummary = {
  submissionId: "synthetic-submission", importedAt: day, lastMeasurementDate: "2026-09-02",
  historicalOnly: true, notLiveConnectorData: true,
  labs: { resultCount: 3, reportCount: 2, firstDate: "2025-01-01", lastDate: "2026-09-01", latestResultCount: 1,
    latestResults: [{ marker: "Example marker", value: "2", units: "example units", flag: "Source alert", referenceInterval: "1–3", collectedAt: "2026-09-01", fasting: "No", sourceFile: "synthetic.pdf" }] },
  sleep: { pap: { device: "Example PAP device", startDate: "2026-08-01", endDate: "2026-08-30", averageUsageMinutes: 350, averageAhi: 1, totalWindowDays: 30 },
    oxygen: [{ startDate: "2026-09-01", endDate: "2026-09-02", meanSpo2: 96, minimumSpo2: 93, timeBelow90: "00:00:00" }] },
  donationDates: ["2026-09-10"], sourceNotes: ["Synthetic processing caveat"], evidenceLimits: ["Historical only"],
};
const originalArchive = JSON.stringify(archive);
const historical = buildBlueprintWellnessOverview({ asOfDate: day, goals: ["Sleep", "Sleep", "Meaningful connections"], importedRecords: archive,
  checkIn: { date: "2026-10-03", sleep: 5, energy: 8, weight: 180 } });
assert.deepEqual(historical.priorities, ["Sleep", "Meaningful connections"]);
assert.match(historical.areas[0].records.join(" "), /Historical imported records.*2026-08-01/);
assert.match(historical.areas[0].records.join(" "), /do not establish.*treatment efficacy/);
assert.match(historical.areas[0].records.join(" "), /2026-10-03.*5\/5/);
assert.match(historical.areas[0].today, /today is not established/);
assert.match(historical.areas[2].records.join(" "), /180 lb/);
assert.match(historical.areas[3].today, /not established/);
assert.match(historical.areas[4].records.join(" "), /Latest collection: 2026-09-01/);
assert.match(historical.areas[4].records.join(" "), /Example marker: Source alert/);
assert.match(historical.areas[4].records.join(" "), /Source caveats/);
assert.match(historical.areas[4].today, /units.*fasting.*caveats/);
assert.match(historical.areas[4].today, /do not establish today's status/);
assert.equal(JSON.stringify(archive), originalArchive, "Overview must not alter the archive or its full source caveats.");
assert(!historical.areas[1].records.length && !historical.areas[2].today.includes("progress"));

const current = buildBlueprintWellnessOverview({ asOfDate: day, importedRecords: archive, checkIn: { date: day, sleep: 1, energy: 0, weight: 180 } });
assert.match(current.areas[0].today, /older device records do not override/);
assert.match(current.areas[3].records.join(" "), /energy 0\/10/);
assert.match(current.areas[3].today, /How you feel emotionally remains yours/);
assert.match(current.areas[2].today, /Diet quality.*require your own description/);

const connected: ConnectedHealthSummary = { provider: "apple_health", status: "connected", requestedDataTypes: ["steps", "sleep", "weight", "exercise_time"], lastSyncCompletedAt: "2026-10-04T12:00:00Z",
  latest: { local_date: day, time_zone: "America/Denver", steps: 0, sleep_minutes: 420, exercise_minutes: 0, weight_kg: 82,
    resting_heart_rate: null, active_energy_kcal: null, source_updated_at: "2026-10-04T11:00:00Z" } };
const connectedBefore = JSON.stringify(connected);
const device = buildBlueprintWellnessOverview({ asOfDate: day, connectedHealth: connected });
assert.match(device.areas[0].records.join(" "), /420 sleep minutes.*does not establish sleep quality/);
assert.match(device.areas[0].today, /not established/);
assert.match(device.areas[1].records.join(" "), /0 steps; 0 exercise minutes/);
assert.match(device.areas[1].today, /available for today/);
assert.match(device.areas[2].records.join(" "), /82 kg/);
assert.match(device.areas[2].today, /weight record is available for today/);
assert.match(device.areas[3].today, /not established/);
const oldDevice = buildBlueprintWellnessOverview({ asOfDate: day, connectedHealth: { ...connected, latest: { ...connected.latest!, local_date: "2026-10-03" } } });
assert.match(oldDevice.areas[1].today, /not established by older records/);
assert.match(oldDevice.areas[2].today, /not established by older records/);
const disconnected = buildBlueprintWellnessOverview({ asOfDate: day, connectedHealth: { ...connected, status: "paused" } });
assert(disconnected.areas.every((area) => !area.records.length), "Paused or disconnected data must not imply an active connection.");
assert.equal(JSON.stringify(connected), connectedBefore);

const handoff: ApprovedHealthContextHandoff = {
  id: "synthetic-handoff", snapshotDate: day, sourceWindow: { start: "2026-09-15", end: "2026-09-30" },
  memberApproved: true, createdAt: "2026-10-04T12:00:00Z", proposedFocus: "Synthetic member focus",
  areas: { sleep: { summary: "Synthetic sleep description", dataCompleteness: "Incomplete" }, exercise: { summary: "Synthetic activity description", dataCompleteness: "Limited" },
    diet_weight: { summary: "Synthetic eating description", dataCompleteness: "Limited" }, overall_feeling: { summary: "Synthetic member feeling", dataCompleteness: "Self-described" },
    lab_balance: { summary: "Synthetic source range description", dataCompleteness: "One source panel", resultWindow: { start: "2026-08-01", end: "2026-09-01" }, measurementContext: "Non-fasting; source units and ranges retained", interpretationBasis: "source_lab_reference_ranges" } },
};
const handoffBefore = JSON.stringify(handoff);
const approved = buildBlueprintWellnessOverview({ asOfDate: day, handoff });
assert(approved.areas.every((area) => area.records.some((record) => record.includes("Member-approved summary"))));
assert.match(approved.areas[3].records.join(" "), /2026-09-15–2026-09-30; approved snapshot 2026-10-04/);
assert.match(approved.areas[3].today, /not established/, "An approval date is not the source measurement date or today's feeling.");
assert.match(approved.areas[4].records.join(" "), /2026-08-01–2026-09-01/);
assert.match(approved.areas[4].records.join(" "), /Non-fasting.*not a diagnosis/);
assert.equal(JSON.stringify(handoff), handoffBefore);
const unapproved = buildBlueprintWellnessOverview({ asOfDate: day, handoff: { ...handoff, memberApproved: false } as unknown as ApprovedHealthContextHandoff });
assert(unapproved.areas.every((area) => !area.records.length));
const huge = buildBlueprintWellnessOverview({ asOfDate: day, goals: Array.from({ length: 25 }, (_, i) => `${i} ${"x".repeat(200)}`),
  handoff: { ...handoff, areas: { ...handoff.areas, sleep: { summary: "x\u0000".repeat(5000), dataCompleteness: "y".repeat(5000) } } } });
assert.equal(huge.priorities.length, 8);
assert(huge.priorities.every((goal) => goal.length <= 100));
assert(huge.areas.every((area) => area.records.length <= 6 && area.records.every((record) => record.length <= 1100 && !record.includes("\u0000"))));
const intro = blueprintWellnessIntroMarkdown(historical);
assert.match(intro, /not a shopping list/);
assert.match(intro, /No new supplement is required/);
assert.match(intro, /\*\*Sleep:\*\*/);
assert.match(intro, /\*\*Lab balance:\*\*/);
assert.doesNotMatch(intro, /first additions|synthetic-submission|synthetic\.pdf/);
assert.equal(blueprintOverviewLocalDate(new Date("2026-10-04T02:00:00Z"), "America/Denver"), "2026-10-03");
assert.equal(blueprintOverviewLocalDate(new Date("2026-10-04T02:00:00Z"), "bad-timezone"), day);
assert.equal(blueprintOverviewLocalDate(new Date("2026-10-04T02:00:00Z"), null), day);

const routine = [{ name: "Omega-3 fish oil" }, { name: "Psyllium husk" }, { name: "Vitamin D3 + K2" }, { name: "Red yeast rice + CoQ10" }, { name: "Magnesium L-threonate" }];
assert.equal(healthItemIdentityKey("Omega-3 fish oil"), healthItemIdentityKey("Omega-3"));
assert.equal(healthItemIdentityKey("Psyllium husk"), healthItemIdentityKey("Soluble fiber (psyllium)"));
assert.notEqual(healthItemIdentityKey("Vitamin D3 + K2"), healthItemIdentityKey("Vitamin D"));
assert.notEqual(healthItemIdentityKey("Red yeast rice + CoQ10"), healthItemIdentityKey("CoQ10"));
assert.notEqual(healthItemIdentityKey("Magnesium L-threonate"), healthItemIdentityKey("Magnesium Glycinate"));
for (const name of ["Omega-3", "Soluble fiber (psyllium)"]) assert.equal(classifyBlueprintRecommendation(name, routine).status, "Current - optimize");
for (const name of ["Vitamin D", "CoQ10", "Magnesium Glycinate"]) assert.equal(classifyBlueprintRecommendation(name, routine).status, "Clinician review");
assert.equal(classifyBlueprintRecommendation("Creatine", routine).status, "New - consider");
assert.deepEqual(recommendationOverlapNames("Glycine", [{ name: "Magnesium Glycinate" }]), []);
assert.deepEqual(recommendationOverlapNames("", routine), []);

const report = ["## Your Blueprint Recommendations", "", "| Rank | Supplement | Status | Why it Matters |", "| --- | --- | --- | --- |",
  "| 1 | Omega-3 | New - consider | Synthetic original reason |",
  "| 2 | Soluble fiber (psyllium) | New - consider | Synthetic original reason |",
  "| 3 | Vitamin D | New - consider | Synthetic original reason |",
  "| 4 | CoQ10 | New - consider | Synthetic original reason |",
  "| 5 | Magnesium Glycinate | New - consider | Synthetic original reason |",
  "| 6 | Creatine | New - consider | Synthetic original reason |",
  "| 7 | Creatine monohydrate | New - consider | Duplicate alias |",
  "| 8 | Vitamin B12 | Clinician review | Existing safety restriction |",
  "| 9 | Metformin | New - consider | Not a supplement |"].join("\n");
const reconciled = reconcileBlueprintRecommendationBody(report, routine);
assert.match(reconciled, /Omega-3 \| Current - optimize \| Already recorded in Routine/);
assert.match(reconciled, /Vitamin D \| Clinician review \| Possible overlap with Vitamin D3 \+ K2/);
assert.match(reconciled, /Synthetic original reason/);
assert.match(reconciled, /Vitamin B12 \| Clinician review \| Existing safety restriction/);
assert.equal(reconcileBlueprintRecommendationBody(reconciled, routine), reconciled, "Display reconciliation must be idempotent.");
const restricted = reconcileBlueprintRecommendationBody("| 1 | Omega-3 | Clinician review | Keep the original caution |", routine);
assert.match(restricted, /\| Clinician review \| Already recorded.*Keep the original caution/);
assert.equal(reconcileBlueprintRecommendationBody(report, []), report, "Missing context must never relax a saved restriction.");
const proposals = extractReportRecommendationProposals(report, routine.map((item) => item.name));
assert.equal(proposals.length, 1, "Exact aliases, family overlaps, medication entries and proposal aliases must not become new ideas.");
assert.equal(healthItemIdentityKey(proposals[0].name), "creatine-monohydrate");
assert.equal(extractReportRecommendationProposals(reconciled, routine.map((item) => item.name)).length, 1);
assert.equal(classifyBlueprintRecommendation("Omega-3", []).status, "New - consider", "An absent/stopped routine item is not automatically current.");

console.log("Blueprint five-area overview and routine reconciliation assertions passed.");
