import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import {
  EVIDENCE_LIBRARY_MANIFEST,
  EVIDENCE_MASTER_LIBRARY,
  auditEvidenceMasterLibrary,
  evidenceReviewStatus,
  findEvidenceMasterEntry,
} from "../evidence/evidenceMasterLibrary.ts";
const require = createRequire(import.meta.url);
const curatedEvidence = require("../evidence/evidence_index_top3.json") as Record<string, Array<{ url?: string }>>;
const normalizedEvidenceKeys = new Set(Object.keys(curatedEvidence).map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
const coachSource = readFileSync("src/lib/coachEvidence.ts", "utf8");
const dosingSource = readFileSync("src/lib/supplementDosingRegistry.ts", "utf8");
const contextSource = readFileSync("src/lib/ai/contextualCoachData.ts", "utf8");

const audit = auditEvidenceMasterLibrary(new Date("2026-08-27T00:00:00Z"));
assert.equal(audit.entryCount, 14, "The first maintained library release should cover all current coaching and dose-guidance entries.");
assert.deepEqual(audit.issues, [], "The master library must not ship duplicate, incomplete, or invalid metadata.");
assert.deepEqual(EVIDENCE_LIBRARY_MANIFEST.safetyRuleSources, ["public.interactions", "public.rules"]);
assert.ok(EVIDENCE_LIBRARY_MANIFEST.safetyProvenanceFields.includes("last_reviewed_on"));
assert.ok(EVIDENCE_LIBRARY_MANIFEST.safetyProvenanceFields.includes("provenance_status"));

for (const entry of EVIDENCE_MASTER_LIBRARY) {
  assert.equal(evidenceReviewStatus(entry, new Date("2026-08-27T00:00:00Z")), "current", `${entry.name} should be current at release.`);
  const citationKey = entry.citationLookup.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  assert.ok(normalizedEvidenceKeys.has(citationKey), `${entry.name} must resolve to an exact curated evidence key.`);
  assert.ok(curatedEvidence[entry.citationLookup]?.some((citation) => /^https:\/\//.test(citation.url ?? "")), `${entry.name} must have an HTTPS citation.`);
  assert.ok(entry.safetyTopics.length, `${entry.name} must name its safety review topics.`);
}

assert.equal(evidenceReviewStatus(EVIDENCE_MASTER_LIBRARY[0], new Date("2027-09-01T00:00:00Z")), "review_due", "Stale evidence must become visibly due for review.");
assert.equal(findEvidenceMasterEntry("fish oil")?.id, "evidence_omega_3");
assert.equal(findEvidenceMasterEntry("magnesium bisglycinate")?.id, "evidence_magnesium_glycinate");
assert.equal(findEvidenceMasterEntry("turmeric")?.id, "evidence_curcumin");

assert.equal(findEvidenceMasterEntry("Creatine")?.doseGuidance?.name, "Creatine Monohydrate");
assert.equal(findEvidenceMasterEntry("psyllium husk")?.doseGuidance?.name, "Soluble fiber (psyllium)");
assert.equal(findEvidenceMasterEntry("Vitamin D3")?.doseGuidance?.lastReviewed, "2026-08-15");

assert.match(coachSource, /EVIDENCE_MASTER_LIBRARY/, "Coaching retrieval must use the master library.");
assert.doesNotMatch(coachSource, /const EVIDENCE_SEEDS/, "Coaching must not keep a second evidence registry.");
assert.match(coachSource, /lastReviewed: entry\.lastReviewed/);
assert.match(coachSource, /safetySummary: entry\.safetySummary/);
assert.match(dosingSource, /findEvidenceMasterEntry/, "Dose guidance must resolve from the master library.");
assert.doesNotMatch(dosingSource, /const REGISTRY/, "Dose guidance must not keep a second registry.");
assert.match(contextSource, /last_reviewed: option\.lastReviewed/);
assert.match(contextSource, /review_status: option\.reviewStatus/);
assert.match(contextSource, /safety_summary: option\.safetySummary/);

console.log("PR140 evidence master library acceptance scenarios passed.");
