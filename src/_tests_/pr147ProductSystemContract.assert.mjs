import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contract = JSON.parse(
  await readFile("docs/product-system-vnext.contract.json", "utf8"),
);
const document = await readFile("docs/product-system-vnext.md", "utf8");
const navigation = await readFile("src/lib/authenticatedNavigation.ts", "utf8");

assert.equal(contract.pullRequest, 147);
assert.equal(contract.status, "contract-only");
assert.deepEqual(contract.implementationBoundaries, {
  changesRuntimeBehavior: false,
  changesDatabaseSchema: false,
  changesMemberNavigation: false,
  createsPlanChangeLedger: false,
  externalBetaBeforeFounderGate: false,
});

assert.deepEqual(
  contract.informationArchitecture.targetPaidPrimaryNavigation.map(({ label }) => label),
  ["Today", "Plan", "Journey"],
);
assert.deepEqual(
  contract.informationArchitecture.currentPaidPrimaryNavigation.map(({ label }) => label),
  ["Today", "Routine", "Journey", "Blueprints", "Settings"],
);

for (const item of contract.informationArchitecture.currentPaidPrimaryNavigation) {
  assert.ok(
    navigation.includes(`{ href: "${item.route}", label: "${item.label}" }`),
    `Current navigation contract drifted for ${item.label}`,
  );
}

assert.equal(contract.surfaceRoles.plan.includes("canonical current"), true);
assert.equal(contract.surfaceRoles.blueprint.includes("free baseline"), true);
assert.equal(contract.surfaceRoles.changeHistory.includes("without becoming primary navigation"), true);

const semanticKinds = new Set(contract.recordSemantics.map(({ kind }) => kind));
for (const required of [
  "canonical-state",
  "change-event",
  "execution-event",
  "observation",
  "generated-artifact",
  "product-analytics",
]) {
  assert.ok(semanticKinds.has(required), `Missing record semantic: ${required}`);
}

assert.deepEqual(contract.interactionContract.requiredStates, [
  "idle",
  "submitting",
  "success",
  "recoverable-error",
  "terminal-error",
]);

assert.ok(contract.memberMutationInventory.length >= 25);
const mutationKeys = contract.memberMutationInventory.map(({ method, route }) => `${method} ${route}`);
assert.equal(new Set(mutationKeys).size, mutationKeys.length, "Mutation routes must be unique by method and route");

for (const { method, route } of contract.memberMutationInventory) {
  const routeSource = await readFile(`app${route}/route.ts`, "utf8");
  assert.match(
    routeSource,
    new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`),
    `Mutation inventory drifted for ${method} ${route}`,
  );
}

const healthPlanMutations = contract.memberMutationInventory.filter(({ ledgerIntent }) =>
  ["regimen-change", "practice-change"].includes(ledgerIntent),
);
assert.ok(healthPlanMutations.length >= 8);
assert.ok(healthPlanMutations.every(({ confirmation }) => ["explicit", "submit"].includes(confirmation)));

const executionAndAnalytics = contract.memberMutationInventory.filter(({ semantic }) =>
  ["execution-event", "product-analytics"].includes(semantic),
);
assert.ok(executionAndAnalytics.every(({ ledgerIntent }) => ledgerIntent === "none"));

assert.equal(contract.plannedLedger.implementationPullRequest, 151);
assert.equal(contract.plannedLedger.approach, "lightweight-append-only");
assert.deepEqual(contract.plannedLedger.initialDomains, ["regimen", "practice"]);
assert.ok(contract.plannedLedger.invariants.some((rule) => rule.includes("same transaction")));
assert.ok(contract.plannedLedger.invariants.some((rule) => rule.includes("AI may structure")));

assert.deepEqual(contract.deliverySequence, Array.from({ length: 16 }, (_, index) => 147 + index));
assert.equal(contract.founderGate.requiredBeforeExternalRecruitment, true);

for (const requiredText of [
  "PR147 changes no member-facing behavior",
  "Current and target information architecture",
  "Data semantics",
  "Member interaction contract",
  "Lightweight plan-change ledger decision",
  "External beta recruitment is not part of this sequence",
]) {
  assert.ok(document.includes(requiredText), `Architecture document missing: ${requiredText}`);
}

console.log("PR147 product-system contract assertions passed.");
