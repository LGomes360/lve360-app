import assert from "node:assert/strict";

import {
  formatPersonaRegressionFailure,
  runPersonaRegressionHarness,
} from "./personaRegressionHarness.ts";

const report = runPersonaRegressionHarness();

console.log(
  `Persona regression coverage: ${report.personaCount} personas x ${report.weeksPerPersona} weeks = ${report.personaWeeks} persona-weeks.`,
);
console.log(`Deterministic assertions evaluated: ${report.assertions}.`);
console.log(`Age bands: ${report.coverage.ageBands.join(", ")}.`);
console.log(`Identity directions: ${report.coverage.identityDirections.join(", ")}.`);
console.log(`Regimen complexity: ${report.coverage.regimenComplexities.join(", ")}.`);
console.log(`Access needs represented: ${report.coverage.accessNeeds.length}.`);

if (report.failures.length) {
  console.error(`\n${report.failures.length} persona regression failure${report.failures.length === 1 ? "" : "s"}:`);
  for (const failure of report.failures) console.error(`- ${formatPersonaRegressionFailure(failure)}`);
}

assert.equal(
  report.failures.length,
  0,
  "The 24-persona multi-week regression harness found product-learning invariant failures.",
);

console.log("PR137 24-persona multi-week regression assertions passed.");
