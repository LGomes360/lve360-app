import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const route = read("app/api/routine/copilot/route.ts");
const panel = read("src/components/routine/RoutineCopilotPanel.tsx");
const client = read("app/(app)/routine/RoutineClient.tsx");
const modelConfig = read("src/lib/ai/modelConfig.ts");
const printPage = read("app/(app)/routine/print/page.tsx");

assert.match(route, /requirePaidApi/, "Routine Copilot must remain paid-gated.");
assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(/, "Routine Copilot proposals must not write regimen data.");
assert.match(panel, /Apply to form/, "The proposal must require explicit form application.");
assert.match(panel, /still not saved|Nothing is saved/, "The UI must distinguish proposal application from persistence.");
assert.match(client, /RoutineCopilotPanel/, "Add and edit flows must expose the organizer.");
assert.match(client, /Save record/, "The existing save confirmation must remain in place.");
assert.match(client, /Add reported \{label\}/, "The existing add confirmation must remain in place.");
assert.match(modelConfig, /routine_label_parser[\s\S]*capability: "mini"/, "The parser must use the cost-conscious mini capability.");
assert.doesNotMatch(printPage, /Member-recorded changes/, "The printout must not spend space on repetitive change provenance.");
assert.match(printPage, /LVE360 member record/, "The printout must still identify the regimen as a member record.");
assert.match(printPage, /LVE360-organized questions for review/, "The printout must distinguish organized questions from facts.");
assert.match(printPage, /not treatment or dosing recommendations/, "The clinician questions must state their boundary.");

console.log("PR102 page and boundary assertions passed.");
