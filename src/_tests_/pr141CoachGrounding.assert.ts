import assert from "node:assert/strict";

import { coachGroundingHeadline, coachGroundingTitle, coachSourceKind, evidenceReviewLabel, groupCoachSources } from "../lib/coachGrounding.ts";
import type { CoachSource } from "../lib/contextualCoach.ts";

const sources: CoachSource[] = [
  { id: "current_blueprint", label: "Current Blueprint", summary: "Current", href: "/blueprints/1", kind: "member_record" },
  { id: "weekly_practice", label: "Weekly Practice", summary: "3 of 5", href: "/today" },
  { id: "evidence_magnesium_glycinate", label: "Magnesium evidence", summary: "Mixed", href: "https://pubmed.ncbi.nlm.nih.gov/1/", kind: "evidence", evidence_strength: "Mixed", reviewed_at: "2026-08-15", review_status: "current" },
  { id: "safety_magnesium-glycinate", label: "NIH ODS", summary: "Spacing rule", href: "https://ods.od.nih.gov/", confidence: "high" },
];

const groups = groupCoachSources(sources);
assert.equal(groups.records.length, 2);
assert.equal(groups.evidence.length, 1);
assert.equal(groups.safety.length, 1);
assert.equal(coachSourceKind(sources[1]), "member_record", "Historical member sources must remain compatible.");
assert.equal(coachSourceKind(sources[3]), "safety", "Historical safety source IDs must remain compatible.");
assert.equal(coachGroundingHeadline(groups), "Personalized with your saved records, maintained evidence, and safety rules.");
assert.equal(coachGroundingTitle(groups), "Why this answer fits you");
assert.equal(coachGroundingTitle({ records: [], evidence: groups.evidence, safety: [] }), "How this answer was grounded");
assert.equal(evidenceReviewLabel(sources[2]), "Reviewed Aug 15, 2026");
assert.equal(evidenceReviewLabel({ ...sources[2], review_status: "review_due" }), "Review due");
assert.equal(evidenceReviewLabel({ ...sources[2], reviewed_at: "not-a-date", review_status: "invalid" }), "Review date unavailable");

console.log("PR141 coaching grounding scenarios passed.");
