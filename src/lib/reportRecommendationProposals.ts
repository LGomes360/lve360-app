import { healthItemIdentityKey } from "@/lib/healthItemIdentity";
import { parseMarkdownToItems, type ParsedItem } from "@/lib/parseMarkdownToItems";
import { isEligibleSupplementName, isMedicationOrHormoneName } from "@/lib/supplementEligibility";

const ACTIONABLE_REPORT_STATUS = /^new\s+consider$/i;

function reportStatus(notes: string | null | undefined): string {
  return String(notes ?? "")
    .replace(/^Blueprint status:\s*/i, "")
    .replace(/[\u2010-\u2015-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ReportRecommendationProposal = Pick<
  ParsedItem,
  "name" | "rationale" | "dose" | "timing" | "timing_text" | "timing_bucket" | "notes"
>;

/**
 * Returns only explicit, actionable ideas from the dated report. Current items,
 * medication-like entries, and non-actionable statuses remain report text only.
 */
export function extractReportRecommendationProposals(
  reportMarkdown: string,
  currentItemNames: string[],
): ReportRecommendationProposal[] {
  const currentNames = new Set(currentItemNames.map(healthItemIdentityKey).filter(Boolean));

  return parseMarkdownToItems(reportMarkdown).filter((item): item is ParsedItem & { name: string } => {
    const name = item.name?.trim();
    return Boolean(
      name
      && item.is_current === false
      && ACTIONABLE_REPORT_STATUS.test(reportStatus(item.notes))
      && isEligibleSupplementName(name)
      && !isMedicationOrHormoneName(name)
      && !currentNames.has(healthItemIdentityKey(name))
    );
  });
}
