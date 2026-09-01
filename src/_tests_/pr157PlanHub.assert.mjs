import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, data, helpers] = await Promise.all([
  readFile("app/(app)/plan/page.tsx", "utf8"),
  readFile("src/lib/planHubData.ts", "utf8"),
  readFile("src/lib/planHub.ts", "utf8"),
]);

assert.match(page, /requireTier\(\["premium", "trial"\], \{ next: "\/plan" \}\)/, "Plan must remain a paid authenticated surface.");
assert.match(page, /Your current health plan, connected\./, "Plan must explain its continuity role.");
assert.match(page, /Current focus/, "Plan must show one current focus.");
assert.match(page, /What you are building over time/, "Plan must show durable Practices.");
assert.match(page, /What you currently take/, "Plan must summarize the canonical regimen.");
assert.match(page, /Schedule coverage/, "Plan must expose schedule completeness.");
assert.match(page, /Safety status/, "Plan must preserve safety visibility.");
assert.match(page, /Recent confirmed changes/, "Plan must expose recent confirmed history.");
assert.match(page, /href="\/routine"/, "Regimen edits must route to Routine.");
assert.match(page, /href="\/journey"/, "Change learning must route to Journey.");
assert.doesNotMatch(page, /from\("openai"\)|generateText|generateObject/, "Plan must remain deterministic and cost-free.");

assert.match(data, /getCurrentBlueprintContext\(userId\)/, "Plan safety and baseline must use the current Blueprint context.");
assert.match(data, /getCurrentRegimen\(userId\)/, "Plan regimen must use canonical current state.");
assert.match(data, /\.from\("practices"\)/, "Plan must read durable Practices.");
assert.match(data, /\.from\("plan_change_events"\)/, "Plan must read the append-only change ledger.");
assert.match(data, /Promise\.all/, "Independent Plan reads should run in parallel.");
assert.match(helpers, /buildPlanScheduleCoverage/, "Schedule coverage must have deterministic derivation.");
assert.match(helpers, /item\.schedule/, "Structured schedules must remain distinguishable from timing notes.");

console.log("PR157 Plan Hub foundation assertions passed.");
