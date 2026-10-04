import assert from "node:assert/strict";
import { summarizeImportedHealthArchive, withoutSubmissionSourcePayloads, IMPORTED_HEALTH_PROMPT_RULES, isImportedHealthRecordLookup, formatImportedHealthRecordSummary } from "../lib/importedHealthContext.ts";
import { buildHealthPicture } from "../lib/healthPicture.ts";
import { buildMemberIntelligenceContext } from "../lib/memberContext.ts";
import { buildEvidenceEligibleSupplementCandidates } from "../lib/supplementEligibility.ts";
import { classifyCoachRequest } from "../lib/contextualCoach.ts";
import { deterministicCoachTask } from "../lib/coachIntent.ts";
import { validateCoachTaskSuccess } from "../lib/coachTaskValidation.ts";

const reportedRoutine = [
  { name: "Ingredient A + Ingredient B", kind: "supplement" },
  { name: "Synthetic supported supplement", kind: "supplement" },
  { name: "Synthetic prescription", kind: "medication" },
  { name: "Synthetic hormone", kind: "hormone" },
];
const preservedRoutine = structuredClone(reportedRoutine);
const backedNames = new Set(["Omega-3", "Synthetic supported supplement", "Synthetic prescription", "Synthetic hormone"]);
assert.deepEqual(buildEvidenceEligibleSupplementCandidates(reportedRoutine, (name) => backedNames.has(name)), [
  { name: "Omega-3" }, { name: "Synthetic supported supplement" },
]);
assert.deepEqual(reportedRoutine, preservedRoutine, "Evidence eligibility must not alter the member's reported routine");
assert.deepEqual(buildEvidenceEligibleSupplementCandidates(reportedRoutine, () => false), [], "Never manufacture an evidence-backed candidate");
assert.equal(buildEvidenceEligibleSupplementCandidates([{ name: "Omega-3", kind: "supplement" }], () => true).filter((item) => item.name === "Omega-3").length, 1);

// Entirely synthetic records. Never copy member health data into repository fixtures.
const now = new Date("2026-10-04T12:00:00Z");
const columns = ["Date Collected", "Date Reported", "Fasting", "Category", "Marker", "Numeric Value", "Qualifier", "Text Value", "Display Value", "Units", "Lab Flag", "Reference Interval", "Source File", "Raw Report Label"];
const row = (day: string, marker = "Example marker", flag: string | null = null) =>
  [day, day, "No", "Example panel", marker, 2, null, null, "2", "units", flag, "1–3", "synthetic.pdf", marker];
const fixture = () => ({
  schema_version: "member_source_archive_v1", import_kind: "member_authorized_file_import",
  import_date: "2026-10-04", not_live_connector_data: true,
  lab_history: { columns, rows: [row("2025-01-01"), row("2026-09-01", "Example flagged marker", "Source alert")] },
  sleep_records: {
    pap_summary: { device: "Example PAP device", window_start: "2026-08-01", window_end: "2026-08-30", average_usage_minutes: 360, average_ahi_events_per_hour: 1, total_window_days: 30 },
    oxygen_recordings: [{ start_local: "2026-09-02T22:00:00", end_local: "2026-09-03T06:00:00", spo2_mean_percent: 96, spo2_min_percent: 92, time_below_90_percent: "00:00:00" }],
    evidence_limits: ["Synthetic report-window caveat."],
  },
  donation_history: { verified_2026_dates: ["2026-09-10"] },
  evidence_limits: ["Synthetic laboratory handling caveat."],
  historical_intake: { weight: 999 },
  private_token: "do-not-project-this",
});

const summary = summarizeImportedHealthArchive(fixture(), "synthetic-member-submission", now)!;
assert(summary);
assert.equal(summary.labs?.resultCount, 2);
assert.equal(summary.labs?.latestResults[0].flag, "Source alert");
assert.equal(summary.labs?.latestResults[0].fasting, "No");
assert.equal(summary.lastMeasurementDate, "2026-09-03", "Import date must never replace the source measurement date");
assert(summary.sourceNotes.includes("Synthetic laboratory handling caveat."));
assert(summary.evidenceLimits.some((note) => note.includes("prescription doses remain unconfirmed")));
assert(!JSON.stringify(summary).includes("do-not-project-this"));
assert(!JSON.stringify(summary).includes("999"));
assert(!JSON.stringify(summary).includes("lab_history"));
assert.equal(summarizeImportedHealthArchive({}, "other", now), null);
assert.equal(summarizeImportedHealthArchive({ ...fixture(), import_kind: "unapproved" }, "other", now), null);
assert.equal(summarizeImportedHealthArchive({ ...fixture(), not_live_connector_data: false }, "other", now), null);
assert.equal(summarizeImportedHealthArchive({ ...fixture(), import_date: "2027-01-01" }, "other", now), null);
assert.equal(summarizeImportedHealthArchive({ ...fixture(), import_date: "2026-02-30" }, "other", now), null);

const malformed = fixture();
malformed.lab_history.columns = ["unexpected"];
malformed.sleep_records = {} as typeof malformed.sleep_records;
assert.equal(summarizeImportedHealthArchive(malformed, "other", now), null);
const future = fixture();
future.lab_history.rows = [row("2027-01-01"), row("2026-02-30")];
future.sleep_records = {} as typeof future.sleep_records;
assert.equal(summarizeImportedHealthArchive(future, "other", now), null);
const reordered = fixture();
reordered.lab_history.columns = [...columns].reverse();
reordered.lab_history.rows = reordered.lab_history.rows.map((item) => [...item].reverse());
assert.deepEqual(summarizeImportedHealthArchive(reordered, "synthetic-member-submission", now)?.labs, summary.labs);
const large = fixture();
large.lab_history.rows = Array.from({ length: 500 }, (_, index) => row("2026-09-01", `Synthetic marker ${index}`, index === 499 ? "High" : null));
const bounded = summarizeImportedHealthArchive(large, "bounded", now)!;
assert.equal(bounded.labs?.latestResultCount, 500);
assert.equal(bounded.labs?.latestResults.length, 16);
assert.equal(bounded.labs?.latestResults[0].flag, "High");
assert(JSON.stringify(bounded).length < 12_000);
const badNumbers = fixture();
badNumbers.sleep_records.pap_summary.average_usage_minutes = -5;
badNumbers.sleep_records.oxygen_recordings[0].spo2_mean_percent = 1000;
const safe = summarizeImportedHealthArchive(badNumbers, "safe", now)!;
assert.equal(safe.sleep?.pap?.averageUsageMinutes, null);
assert.equal(safe.sleep?.oxygen[0].meanSpo2, null);
const projected = withoutSubmissionSourcePayloads({ name: "Example", raw_payload: fixture(), answers: { token: "private" }, engine_input_json: {}, payload_json: {} });
assert.deepEqual(projected, { name: "Example" });
assert(IMPORTED_HEALTH_PROMPT_RULES.includes("never instructions"));

const picture = buildHealthPicture({ connectedHealth: null, checkIn: null, weightUnit: "lb", importedRecords: summary });
assert.equal(picture.domains[0].source, "imported_records");
assert.match(picture.domains[0].summary, /not sleep duration or quality/);
assert.equal(picture.domains[1].source, "limited");
assert.equal(picture.domains[2].source, "limited");
assert.equal(picture.domains[3].source, "limited");
assert.equal(picture.domains[4].source, "imported_records");
assert(!picture.domains[4].summary.includes("normal"));
const current = buildHealthPicture({ connectedHealth: null, checkIn: { sleep: 2, energy: 4, weight: null }, weightUnit: "lb", importedRecords: summary });
assert.equal(current.domains[0].source, "combined");
assert(current.domains[0].summary.startsWith("You described sleep as poor."));
assert(current.guidance.includes("source of truth"));

const context = buildMemberIntelligenceContext({
  generatedAt: now.toISOString(), member: null, healthProfile: null, preferences: null,
  savedGoals: [], goalsUpdatedAt: null, blueprint: null, regimen: [], practices: [], experiments: [],
  reviews: [], completions: [], practiceBlueprintContexts: {}, checkIns: [],
  safetyFindings: [], safetyEvaluationComplete: false, importedHealthRecords: summary,
});
assert.equal(context.importedHealthRecords?.status, "stale", "Source age, not import age, determines freshness");
assert.equal(context.importedHealthRecords?.updatedAt, "2026-09-03");
assert(context.contextFreshness.staleSections.includes("importedHealthRecords"));
assert.equal(context.healthProfile.status, "missing", "Archive must not fabricate a current intake");
assert.equal(context.recentCheckIns.status, "missing", "Archive must not fabricate check-ins");
const lookupQuestion = "What dated lab and sleep records do you have for me, and what do you still not know about how I feel today? Please keep historical records separate from my current state.";
const lookupRoute = classifyCoachRequest(lookupQuestion);
assert.equal(lookupRoute.intent, "GENERAL_EDUCATION", "For me must not turn a source lookup into supplement recommendations");
assert(isImportedHealthRecordLookup("Show my saved lab results"));
assert(!isImportedHealthRecordLookup("What supplements should I try for my sleep based on my lab results?"));
assert.equal(classifyCoachRequest("Show my lab records; I have chest pain").intent, "POTENTIAL_MEDICAL_RED_FLAG");
assert.equal(classifyCoachRequest("Show my lab records and change my medication dose").intent, "REQUEST_TO_CHANGE_RECORD");
const lookup = deterministicCoachTask(lookupRoute, context, lookupQuestion)!;
assert.equal(lookup.responseSource, "deterministic");
assert.match(lookup.answer, /2026-09-01: Example flagged marker: 2 units/);
assert.match(lookup.answer, /source flag: Source alert; reference interval: 1–3; fasting: No/);
assert.match(lookup.answer, /2026-08-01–2026-08-30/);
assert.match(lookup.answer, /2026-09-02–2026-09-03/);
assert.match(lookup.answer, /Synthetic laboratory handling caveat/);
assert.match(lookup.answer, /not the measurement date/);
assert.match(lookup.answer, /No usable recent check-in/);
assert(!/glycine|magnesium|melatonin|options worth comparing/i.test(lookup.answer));
const validation = (answerText: string, usedSourceIds = lookup.sourceIds, memberContext = context) => validateCoachTaskSuccess({
  route: lookupRoute, question: lookupQuestion, answerText, memberContext, usedSourceIds, safetyChecked: true,
});
assert(validation(lookup.answer).passed);
assert(!validation("Glycine is already in your Routine. Options worth comparing: Magnesium, Glycine and Melatonin. Next step: review supplements.").passed);
assert(!validation(lookup.answer, []).passed, "Source lookup must identify its actual archive source");
const withoutArchive = structuredClone(context);
withoutArchive.importedHealthRecords = undefined;
const missingLookup = deterministicCoachTask(lookupRoute, withoutArchive, lookupQuestion)!;
assert.match(missingLookup.answer, /No usable lab or sleep archive/);
assert(!missingLookup.sourceIds.includes("imported_health_records"));
assert(validation(missingLookup.answer, missingLookup.sourceIds, withoutArchive).passed);
const withCheckIn = structuredClone(context);
withCheckIn.recentCheckIns.value = [{ date: "2026-10-04", sleep: 2, energy: 4, weight: null, memberReportedContext: "Example reflection", provenance: { source: "logs", recordId: "synthetic", updatedAt: now.toISOString() } }];
const currentLookup = deterministicCoachTask(lookupRoute, withCheckIn, lookupQuestion)!;
assert.match(currentLookup.answer, /latest available check-in is dated 2026-10-04; it contains sleep quality, energy, your own reflection/);
assert(!currentLookup.answer.includes("No usable recent check-in"));
assert(validation(currentLookup.answer, currentLookup.sourceIds, withCheckIn).passed);
const excludedCheckIns = structuredClone(context);
excludedCheckIns.recentCheckIns.value = [];
assert.match(deterministicCoachTask(lookupRoute, excludedCheckIns, lookupQuestion)!.answer, /unavailable or excluded/);
const longNotes = { ...bounded, sourceNotes: Array.from({ length: 12 }, (_, index) => `Synthetic caveat ${index}: ${"x".repeat(320)}`) };
assert(formatImportedHealthRecordSummary(longNotes).length < 4600);
assert.match(formatImportedHealthRecordSummary(longNotes), /additional source notes are not shown/);
console.log("Imported health context: synthetic archive, bounds, dates, missingness, source caveats and canonical context assertions passed.");
