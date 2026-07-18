import {
  parseBlueprintReport,
  REPORT_SECTION_NAMES,
  validateBlueprintReport,
} from "../lib/blueprintReport";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const representativeMarkdown = REPORT_SECTION_NAMES.map((name, index) => {
  const analysis = index < 2 ? "\n\n**Analysis**\n\nThis must not survive." : "";
  const body = name === "This Week Try"
    ? "- Take a ten-minute walk after lunch.\n- Keep a consistent bedtime.\n\n**Analysis**\n\nInternal reasoning must not become a focus item."
    : `Meaningful content for ${name}.${analysis}`;
  return `## ${name}\n\n${body}`;
}).join("\n\n");

const report = parseBlueprintReport(representativeMarkdown);

assert(
  REPORT_SECTION_NAMES.every((name) => report.sections[name].trim().length > 0),
  "Expected all 12 canonical report sections to be non-empty",
);
assert(report.canonicalMarkdown.length > 0, "Expected canonicalMarkdown to be populated");
assert(report.focusItems.length === 2, "Expected This Week Try bullets to populate focusItems");
assert(
  report.focusItems.every((item) => !/analysis|internal reasoning/i.test(item)),
  "Expected analysis prose to be excluded from focusItems",
);
assert(
  !/^\s*(?:\*\*)?Analysis(?:\*\*)?\s*:?\s*$/im.test(report.canonicalMarkdown),
  "Expected empty Analysis headings to be removed",
);
assert(validateBlueprintReport(report).length === 0, "Expected representative report to validate");

const missingGoals = parseBlueprintReport(
  representativeMarkdown.replace(/## Goals\r?\n[\s\S]*?(?=\r?\n## Contraindications)/, ""),
);
assert(
  validateBlueprintReport(missingGoals).includes("empty:Goals"),
  "Expected validation to flag a genuinely missing Goals section",
);

console.log("blueprintReport assertions passed");
