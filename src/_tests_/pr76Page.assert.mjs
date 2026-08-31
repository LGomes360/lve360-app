import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const migration = read("supabase/migrations/20260801205745_pr76_flexible_regimen_organizer.sql");
assert.match(migration, /add column if not exists schedule jsonb/i, "PR76 must persist structured schedules.");
assert.match(migration, /create table if not exists public\.regimen_dose_events/i, "PR76 must store dose occurrences separately.");
assert.match(migration, /unique \(user_id, regimen_item_id, scheduled_date, slot_key\)/i, "One scheduled occurrence must have one owner-scoped record.");
assert.match(migration, /enable row level security/i, "Dose history must use RLS.");
assert.match(migration, /grant select on table public\.regimen_dose_events to authenticated/i, "Members may read only through the owner policy.");
assert.match(migration, /grant select, insert, update, delete on table public\.regimen_dose_events to service_role/i, "Validated server routes must own dose mutations.");

const dosesRoute = read("app/api/routine/doses/route.ts");
assert.match(dosesRoute, /requirePaidApi/, "Dose records must require paid access.");
assert.match(dosesRoute, /eq\("user_id", userId\)/, "Dose records must verify ownership.");
assert.match(dosesRoute, /regimenDoseSlots\(schedule, date\)/, "The server must verify that a scheduled slot is actually due.");
assert.match(dosesRoute, /status !== "taken"/, "As-needed records must not create skipped or overdue states.");
assert.match(dosesRoute, /\.eq\("user_id", entitlement\.user\.id\)/, "Undo must remain owner scoped.");

const today = read("app/(app)/routine/TodayDoses.tsx");
assert.match(today, /Your dose checklist/, "Routine must expose today's scheduled occurrences.");
assert.match(today, /record\(occurrence, "taken"\)/, "Each occurrence needs a Taken action.");
assert.match(today, /record\(occurrence, "skipped"\)/, "Each occurrence needs a neutral Skip action.");
assert.match(today, /Recent dose history/, "Members must be able to review recent records.");
assert.match(today, /never appear overdue/, "As-needed items must not imply nonadherence.");
assert.match(today, /min-h-12/, "Dose controls need large tap targets.");
assert.match(today, /Boolean\(occurrence\.eventId\)/, "Unrecorded occurrences must not inherit the idle null state as busy.");

const editor = read("app/(app)/routine/ScheduleEditor.tsx");
assert.match(editor, /Every number of days/, "Alternating-day schedules must be supported.");
assert.match(editor, /Add another time/, "Multiple daily dose times must be supported.");
assert.match(editor, /aria-pressed/, "Day selection must not rely on color alone.");

const printPage = read("app/(app)/routine/print/page.tsx");
assert.match(printPage, /requireTier\(\["premium", "trial"\]/, "The clinician list must stay private.");
assert.match(printPage, /Current regimen for clinician review/, "The printout needs a clear review purpose.");
assert.match(printPage, /Instruction source/, "The printout must preserve provenance.");
assert.match(printPage, /does not prescribe, change, or verify/, "The printout must use neutral safety language.");

const accountExport = read("app/api/account/export/route.ts");
assert.match(accountExport, /regimen_dose_events/, "Dose history must be included in the member data export.");
assert.match(accountExport, /current_regimen_items/, "The canonical regimen must be included in the member data export.");

console.log("PR76 page, privacy, and safety assertions passed");
