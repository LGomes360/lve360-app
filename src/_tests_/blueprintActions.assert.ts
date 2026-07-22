import { buildBlueprintActionCandidates } from "../lib/blueprintActions";
import { parseBlueprintReport } from "../lib/blueprintReport";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const report = parseBlueprintReport(`
## This Week Try

- Take a ten-minute walk after lunch on Monday, Wednesday, and Friday.
- Take magnesium 200 mg before bed.
- Call a friend after your Saturday morning coffee.
`);
const candidates = buildBlueprintActionCandidates(report);

assert(candidates.length === 3, "Expected every weekly focus item to receive a stable action candidate");
assert(candidates[0].kind === "lifestyle", "Expected a walking action to enter the habit handoff");
assert(candidates[0].category === "movement", "Expected a walking action to be categorized as movement");
assert(candidates[1].kind === "review_only", "Expected a supplement dose to remain review-only");
assert(candidates[2].category === "relationships", "Expected a social action to be categorized as relationships");

const sameReport = buildBlueprintActionCandidates(parseBlueprintReport(report.canonicalMarkdown));
assert(candidates[0].id === sameReport[0].id, "Expected action IDs to be stable for the same report content");

const legacyCandidates = buildBlueprintActionCandidates(parseBlueprintReport("## Intro Summary\n\nA legacy report."));
assert(legacyCandidates.length === 1, "Expected a safe legacy fallback");
assert(legacyCandidates[0].kind === "lifestyle", "Expected the legacy fallback to be a lifestyle action");
assert(legacyCandidates[0].source === "legacy_fallback", "Expected the fallback source to be explicit");

const reviewOnlyCandidates = buildBlueprintActionCandidates(parseBlueprintReport("## This Week Try\n\n- Start magnesium 200 mg before bed."));
assert(reviewOnlyCandidates.some((candidate) => candidate.kind === "review_only"), "Expected the supplement action to stay review-only");
assert(reviewOnlyCandidates.some((candidate) => candidate.kind === "lifestyle"), "Expected a safe fallback when all report actions require review");

console.log("blueprintActions assertions passed");
