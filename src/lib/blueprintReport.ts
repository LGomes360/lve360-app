export const REPORT_SECTION_NAMES = [
  "Intro Summary", "Goals", "Contraindications & Med Interactions", "Current Stack",
  "Your Blueprint Recommendations", "Dosing & Notes", "Evidence & References", "Shopping Links",
  "Follow-up Plan", "Lifestyle Prescriptions", "Longevity Levers", "This Week Try",
] as const;

export type ReportSectionName = typeof REPORT_SECTION_NAMES[number];
export type BlueprintReport = {
  sections: Record<ReportSectionName, string>;
  focusItems: string[];
  canonicalMarkdown: string;
  contentHash: string;
};

function cleanText(value: string): string {
  return value
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/(^|\n)##\s*END\s*(?=\n|$)/gi, "$1")
    .replace(/^\s*\*\*Analysis\*\*\s*:?\s*$/gim, "")
    .replace(/^\s*Analysis\s*:?\s*$/gim, "")
    .replace(/(^|\n)(\s*[-*]\s+)?\s*:\s+/g, "$1$2")
    .replace(/\*\*([^*]+)\*\*\s*:\s*\1\s*:/gi, "**$1**:")
    .replace(/([^\n.!?]+[.!?])\s+\1/gi, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extract(markdown: string, heading: ReportSectionName): string {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = /^##\s+(.+?)\s*$/;
  const headingIndex = lines.findIndex((line) => headingPattern.exec(line)?.[1] === heading);
  if (headingIndex === -1) return "";

  let nextHeadingIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index++) {
    if (headingPattern.test(lines[index])) {
      nextHeadingIndex = index;
      break;
    }
  }

  let body = lines.slice(headingIndex + 1, nextHeadingIndex).join("\n");
  const analysisLine = /^\s*(?:\*\*)?Analysis(?:\*\*)?\s*:?\s*(.*)$/im;
  if (["Intro Summary", "Goals", "Dosing & Notes", "Evidence & References", "Shopping Links", "Lifestyle Prescriptions", "Longevity Levers", "This Week Try"].includes(heading)) {
    body = body.split(analysisLine)[0] ?? body;
  }
  const labels: Partial<Record<ReportSectionName, string>> = {
    "Contraindications & Med Interactions": "Safety Takeaway",
    "Current Stack": "What We Noticed",
    "Your Blueprint Recommendations": "Why These Recommendations",
    "Follow-up Plan": "Follow-up Priorities",
  };
  if (labels[heading]) {
    body = body.replace(analysisLine, (_match, inline: string) =>
      `### ${labels[heading]}${inline?.trim() ? `\n\n${inline.trim()}` : ""}`
    );
  }
  return cleanText(body);
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function parseBlueprintReport(markdown: string): BlueprintReport {
  const cleaned = String(markdown ?? "")
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/(^|\n)##\s*END\s*(?=\n|$)/gi, "$1")
    .trim();
  const sections = Object.fromEntries(REPORT_SECTION_NAMES.map((name) => [name, extract(cleaned, name)])) as Record<ReportSectionName, string>;
  const focusItems = sections["This Week Try"].split(/\r?\n/)
    .map((line) => cleanText(line.replace(/^\s*[-*]\s+/, "")))
    .filter(Boolean)
    .slice(0, 5);
  const canonicalMarkdown = REPORT_SECTION_NAMES
    .filter((name) => sections[name])
    .map((name) => `## ${name}\n\n${sections[name]}`)
    .join("\n\n");
  return { sections, focusItems, canonicalMarkdown, contentHash: hash(canonicalMarkdown) };
}

export function validateBlueprintReport(report: BlueprintReport): string[] {
  const issues: string[] = [];
  for (const name of REPORT_SECTION_NAMES) {
    if (!report.sections[name].trim()) issues.push(`empty:${name}`);
  }
  if (/^\s*(?:Analysis)?\s*:\s*$/m.test(report.canonicalMarkdown)) issues.push("hanging-colon");
  if (/\[object Object\]|##\s*END/i.test(report.canonicalMarkdown)) issues.push("invalid-marker");
  return issues;
}
