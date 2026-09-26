import assert from "node:assert/strict";

import { buildHealthPicture } from "../lib/healthPicture.ts";
import { mapHealthContextHandoffRow } from "../lib/healthContextHandoff.ts";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  snapshot_date: "2026-09-26",
  source_window_start: "2026-09-01",
  source_window_end: "2026-09-26",
  sleep_summary: "Sleep timing was fairly consistent, with shorter duration on several nights.",
  sleep_data_completeness: "Twenty nights included duration; perceived quality was described on eight mornings.",
  exercise_summary: "Movement was regular, while structured exercise was concentrated on weekends.",
  exercise_data_completeness: "Steps were available most days; workout detail was incomplete.",
  diet_weight_summary: "Weight was stable across the available measurements; food context came only from member notes.",
  diet_weight_data_completeness: "Six weight measurements and four member-described eating notes were available.",
  overall_feeling_summary: "The member described steadier energy on mornings after longer sleep.",
  overall_feeling_data_completeness: "Overall feeling came only from the member’s own descriptions.",
  lab_balance_summary: "Reported values were summarized against the source laboratory ranges without diagnostic labels.",
  lab_balance_data_completeness: "The September report included the measured values used in this summary.",
  lab_result_window_start: "2026-09-03",
  lab_result_window_end: "2026-09-03",
  lab_measurement_context: "Units and reference intervals were retained from the September 3 source laboratory report.",
  lab_interpretation_basis: "source_lab_reference_ranges",
  proposed_focus: "Protect a consistent wind-down so tomorrow starts with steadier energy.",
  member_approved: true,
  created_at: "2026-09-26T22:00:00.000Z",
};

const handoff = mapHealthContextHandoffRow(row);
assert.ok(handoff, "a complete member-approved row should map into the UI contract");

const picture = buildHealthPicture({
  connectedHealth: null,
  checkIn: { sleep: 4, energy: 5, weight: null },
  weightUnit: "lb",
  handoff,
});
assert.equal(picture.domains.length, 5);
assert.equal(picture.domains[0].source, "combined", "today’s check-in and approved context should remain visibly distinct");
assert.match(picture.domains[1].summary, /Approved context/);
assert.equal(picture.domains[1].source, "approved_handoff");
assert.match(picture.domains[3].summary, /member described/i, "overall feeling must remain member-described");
assert.match(picture.domains[4].summary, /Units and reference intervals were retained/);
assert.match(picture.domains[4].summary, /not a diagnosis/i);
assert.match(picture.guidance, /never overrides how you say you feel/i);

assert.equal(mapHealthContextHandoffRow({ ...row, member_approved: false }), null);
assert.equal(mapHealthContextHandoffRow({ ...row, lab_interpretation_basis: "generic_ranges" }), null);

console.log("PR187 health-context handoff assertions passed.");
