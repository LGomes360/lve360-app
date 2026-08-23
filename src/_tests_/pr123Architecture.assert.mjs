import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const routine = read("src/lib/routine.ts");
const client = read("app/(app)/routine/RoutineClient.tsx");
const printPage = read("app/(app)/routine/print/page.tsx");
const summary = read("src/lib/clinicianRoutineSummary.ts");
const authority = read("src/lib/medicationRecord.ts");
const migration = read("supabase/migrations/20260823004922_pr123_member_safety_wording.sql");

assert.match(routine, /routineScheduleConflicts/, "PR123 must use one shared conflict detector.");
assert.match(routine, /Ambiguous language is intentionally left alone/, "The detector must avoid guessing from vague schedule text.");
assert.match(client, /Schedule needs confirmation/, "Routine cards must visibly identify schedule conflicts.");
assert.match(client, /Review schedule/, "A conflict must route the member to an actionable confirmation flow.");
assert.match(client, /Nothing has been changed/, "Routine must state that no health record was silently changed.");
assert.match(client, /These two schedule records still disagree/, "The edit flow must continue showing unresolved conflicts.");
assert.match(printPage, /Checklist schedule/, "Print must separately expose the structured checklist schedule.");
assert.match(printPage, /Written schedule/, "Print must separately expose the member's written schedule.");
assert.match(printPage, /Neither record was changed by LVE360/, "Print must preserve the reconciliation boundary.");
assert.match(summary, /written instruction and checklist schedule do not match/, "Clinician review questions must include unresolved schedule conflicts.");
assert.match(authority, /"pharmacist"/, "Internal pharmacist provenance must remain supported.");
assert.match(migration, /update public\.interactions/, "The reviewed interaction qualification must be updated through a migration.");
assert.match(migration, /update public\.rules/, "The reviewed rule qualification must be updated through a migration.");
assert.match(migration, /clinician or healthcare provider/g, "Member-facing rule qualifications must use the preferred language.");
assert.match(migration, /internal instruction_authority value[\s\S]*"pharmacist"/, "Migration notes must explicitly preserve internal pharmacist authority.");

console.log("PR123 architecture and safety wording assertions passed.");
