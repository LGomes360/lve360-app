export type BlueprintSafetyStatus = "safe" | "warning" | "error";

const SAFETY_HEADING = "## Contraindications & Med Interactions";
const NO_MATERIAL_FINDING_RE =
  /\b(?:no material flags? identified|no specific interaction (?:requiring action )?(?:was )?(?:identified|flagged)|no specific conflicts? (?:were )?(?:identified|flagged))\b/i;

function safetySection(markdown: string): string {
  const source = String(markdown ?? "");
  const start = source.toLowerCase().indexOf(SAFETY_HEADING.toLowerCase());
  if (start < 0) return "";

  const bodyStart = start + SAFETY_HEADING.length;
  const remainder = source.slice(bodyStart);
  const nextHeading = /(?:^|\r?\n)##\s+/m.exec(remainder);
  return remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
}

export function blueprintMarkdownFromStack(stack: {
  sections?: unknown;
  summary?: string | null;
}): string {
  if (stack.sections && typeof stack.sections === "object" && "markdown" in stack.sections) {
    const markdown = (stack.sections as { markdown?: unknown }).markdown;
    if (typeof markdown === "string") return markdown;
  }
  return typeof stack.summary === "string" ? stack.summary : "";
}

/**
 * Derive the customer-facing safety badge from the same safety section the
 * customer can read. Report-format validation is intentionally not used here.
 */
export function deriveBlueprintSafetyStatus(markdown: string): BlueprintSafetyStatus {
  const section = safetySection(markdown);
  if (!section) return "error";

  const findings = section
    .split(/^\s*###\s+Safety Takeaway\s*$/im)[0]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line));

  if (!findings.length) return "warning";
  return findings.every((line) => NO_MATERIAL_FINDING_RE.test(line)) ? "safe" : "warning";
}
