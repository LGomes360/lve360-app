import assert from "node:assert/strict";
import {
  blueprintMarkdownFromStack,
  deriveBlueprintSafetyStatus,
} from "../lib/blueprintSafetyStatus.ts";

const report = (safetyBody: string) => `
## Intro Summary

Summary.

## Contraindications & Med Interactions

${safetyBody}

### Safety Takeaway

Keep prescription instructions unchanged and recheck this section whenever your stack changes.

## Current Stack

Current items.
`;

assert.equal(
  deriveBlueprintSafetyStatus(report(
    "- **No material flags identified:** No specific interaction requiring action was identified from the reported stack.",
  )),
  "safe",
  "An explicit no-material-flags finding should produce the qualified green status.",
);

assert.equal(
  deriveBlueprintSafetyStatus(report(
    "- Monitor magnesium glycinate with Lisinopril in relation to blood pressure control.",
  )),
  "warning",
  "A displayed caution must prevent a green safety status.",
);

assert.equal(
  deriveBlueprintSafetyStatus(report([
    "- **No material flags identified:** No specific interaction requiring action was identified.",
    "- Review a possible timing conflict with a pharmacist.",
  ].join("\n"))),
  "warning",
  "A no-flags sentence must not override another displayed caution.",
);

assert.equal(
  deriveBlueprintSafetyStatus("## Intro Summary\n\nSummary only."),
  "error",
  "A missing safety section must fail closed.",
);

assert.equal(
  deriveBlueprintSafetyStatus(report("Review this combination with a pharmacist.")),
  "warning",
  "An unstructured safety section must not receive a green status.",
);

const warningReport = report("- Review this combination with a pharmacist.");
assert.equal(
  deriveBlueprintSafetyStatus(blueprintMarkdownFromStack({
    sections: { markdown: warningReport },
    summary: report("- **No material flags identified:** No specific interaction was identified."),
  })),
  "warning",
  "The visible sections markdown must remain the canonical source when an older summary differs.",
);

console.log("Blueprint safety-status assertions passed.");
