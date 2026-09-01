import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [library, workspace, plan, packageJsonSource] = await Promise.all([
  readFile("app/(app)/blueprints/BlueprintsClient.tsx", "utf8"),
  readFile("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx", "utf8"),
  readFile("app/(app)/plan/page.tsx", "utf8"),
  readFile("package.json", "utf8"),
]);
const packageJson = JSON.parse(packageJsonSource);

assert.match(library, /paid \? "Blueprint archive" : "Blueprint"/, "Paid and free Blueprint roles must remain distinct.");
assert.match(library, /Your saved health baselines/, "Paid Blueprints must present as dated baselines rather than current state.");
assert.match(library, /Your free Blueprint organizes your health context/, "The free Blueprint must remain the baseline product.");
assert.match(library, /href="\/plan"/, "Paid Blueprint archive must direct members to current Plan information.");
assert.match(library, /Open current Plan/, "The Plan handoff must be explicit and member-facing.");
assert.match(library, /Read saved Blueprint/, "The latest saved report must remain readable.");
assert.match(library, /Open PDF/, "PDF access must remain available from the archive.");
assert.match(library, /Earlier Blueprint versions/, "Historical versions must remain visible.");
assert.match(library, /stack_id=\$\{encodeURIComponent\(stack\.id\)\}/, "PDF export must remain tied to the selected saved version.");

assert.match(workspace, /Latest saved Blueprint/, "The latest report must not be mislabeled as living current state.");
assert.match(workspace, /Archived Blueprint/, "Earlier reports must be clearly labeled as archived.");
assert.match(workspace, /This report is a snapshot\. Plan stays current\./, "Blueprint detail must explain the archive-to-Plan boundary.");
assert.match(workspace, /href="\/plan"/, "Blueprint detail must hand off to Plan.");
assert.match(workspace, /href="\/routine"/, "Blueprint detail must hand off regimen maintenance to Routine.");
assert.match(workspace, /Correct the supplement information behind this report/, "Report corrections must remain available and clearly scoped.");
assert.match(workspace, /\/supplements`/, "The existing supplement correction endpoint must remain wired.");
assert.match(workspace, /Refresh Blueprint and safety review/, "Refresh and safety review behavior must remain available.");
assert.match(workspace, /Version history/, "Saved Blueprint history must remain available.");
assert.match(workspace, /api\/export-pdf\?stack_id=/, "The selected Blueprint PDF must remain available.");
assert.match(workspace, /Open the latest version/, "Archived reports must link back to the latest saved version.");
assert.doesNotMatch(workspace, /\/today#todays-plan/, "Blueprint must not route current-plan review to the retired Today anchor.");

assert.match(plan, /Open Blueprint archive/, "Plan must provide a reciprocal path to dated reports and PDFs.");
assert.equal(
  packageJson.scripts["qa:pr161"],
  "node src/_tests_/pr161BlueprintArchive.assert.mjs && node --experimental-strip-types src/_tests_/pr160JourneyIntelligence.assert.ts && node src/_tests_/pr160Architecture.assert.mjs && npm run qa:pr159 && npm run qa:blueprints && npm run qa:pr91 && npm run qa:pr93",
);

console.log("PR161 Blueprint archive and living-information handoff assertions passed.");
