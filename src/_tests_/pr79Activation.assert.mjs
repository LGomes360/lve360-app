import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const model = read("src/lib/premiumActivation.ts");
assert.match(model, /"connected" \| "recoverable" \| "missing"/);
assert.match(model, /email_confirmed_at/);
assert.match(model, /eq\("user_email", email\)/);
assert.match(model, /!isPremiumBlueprint\(stack\.sections\)/);
assert.match(model, /daily_practice_completions/);

const checklist = read("src/components/activation/PremiumActivationChecklist.tsx");
for (const label of [
  "Connect your Blueprint",
  "Choose one weekly practice",
  "Complete your first useful action",
  "Optional while you get started",
]) {
  assert.match(checklist, new RegExp(label));
}
assert.match(checklist, /Connect this Blueprint/);
assert.match(checklist, /fetch\("\/api\/provision-user"/);
assert.match(checklist, /if \(progress\.firstActionComplete\) return null/);

const provision = read("app/api/provision-user/route.ts");
assert.match(provision, /email_confirmed_at/);
assert.match(provision, /reconcile_user_and_attach_v2/);
assert.match(provision, /reconciliationError/);

const today = read("app/(app)/today/TodayClient.tsx");
const blueprints = read("app/(app)/blueprints/BlueprintsClient.tsx");
assert.match(today, /PremiumActivationChecklist/);
assert.match(blueprints, /PremiumActivationChecklist/);
assert.match(today, /experiment\?\.status === "active" \|\| firstActionComplete/);
assert.match(today, /onCompletionStateChange=\{setFirstActionComplete\}/);
assert.match(blueprints, /paid \? null/);

console.log("PR79 premium activation checklist assertions passed");
