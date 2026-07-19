import {
  blueprintStatusTone,
  cleanReportDisplayText,
  reportSectionTitle,
} from "../lib/reportPresentation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(reportSectionTitle("Lifestyle Prescriptions") === "Lifestyle Foundations", "Expected user-friendly lifestyle heading");
assert(cleanReportDisplayText("**Omega-3 (Current Stack)**") === "Omega-3 (Current Stack)", "Expected Markdown markers removed");
assert(cleanReportDisplayText(": An evidence:informed option") === "An evidence-informed option", "Expected hanging colon removed");
assert(blueprintStatusTone("Current - optimize") === "current", "Expected Current status tone");
assert(blueprintStatusTone("New - consider") === "new", "Expected New status tone");
assert(blueprintStatusTone("Clinician review") === "review", "Expected review status tone");

console.log("reportPresentation assertions passed");
