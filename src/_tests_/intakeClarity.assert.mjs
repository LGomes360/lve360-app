import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const embed = read("src/components/intake/IntakeEmbed.tsx");
const modal = read("src/components/intake/IntakeModal.tsx");
const home = read("app/page.tsx");
const pricing = read("app/pricing/page.tsx");
const quiz = read("app/quiz/page.tsx");
const types = read("src/lib/productAnalyticsTypes.ts");
const route = read("app/api/analytics/event/route.ts");
const webhook = read("app/api/tally-webhook/route.ts");
const tallyTypes = read("src/types/tally-normalized.ts");

assert.match(embed, /Tally\.FormPageView/);
assert.match(embed, /intake_page_viewed/);
assert.match(embed, /We do not sell your health/);
assert.match(embed, /Privacy Policy/);
assert.match(modal, /IntakeEmbed/);
assert.match(home, /components\/intake\/IntakeModal/);
assert.match(pricing, /components\/intake\/IntakeModal/);
assert.match(quiz, /components\/intake\/IntakeEmbed/);
assert.match(types, /intake_page_viewed/);
assert.match(route, /intake_page_viewed/);
assert.match(webhook, /normalizeHeight/);
assert.match(webhook, /normalizeWeightPounds/);
for (const fieldId of [
  "question_7K5g10",
  "question_a4oPKX",
  "question_2KO5bg",
  "question_Pzk8r1",
  "question_O7k8ka",
  "question_o2lQ0N",
  "question_Vzoy96",
  "question_Bx8JON",
]) {
  assert.match(tallyTypes, new RegExp(fieldId));
}
for (const newGoalId of [
  "fe7acb91-78e0-4472-8413-0f682e03ebb6",
  "fbb243b9-3b5b-40d4-93ec-d5ad18287e5e",
  "1ef089e2-3bce-4f45-aaac-009a23b3d348",
  "63f72695-b77b-4f4f-a454-63894d59254c",
]) {
  assert.match(webhook, new RegExp(newGoalId));
}

console.log("Intake clarity assertions passed.");
