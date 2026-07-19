import {
  AFFILIATE_DISCLOSURE_NEAR_LINKS,
  AFFILIATE_DISCLOSURE_SUPPORT,
} from "./reportDisclosures";

export const REPORT_DISCLAIMER_TEXT =
  `This plan from LVE360 (Longevity | Vitality | Energy) is for educational purposes only and is not medical advice. It is not intended to diagnose, treat, cure, or prevent any disease. Always consult with your healthcare provider before starting new supplements or making significant lifestyle changes, especially if you are pregnant, nursing, managing a medical condition, or taking prescriptions. Supplements are regulated under the Dietary Supplement Health and Education Act (DSHEA); results vary and no outcomes are guaranteed. If you experience unexpected effects, discontinue use and seek professional care. By using this report, you agree that decisions about your health remain your responsibility and that LVE360 is not liable for how information is applied. Affiliate disclosure: ${AFFILIATE_DISCLOSURE_NEAR_LINKS} ${AFFILIATE_DISCLOSURE_SUPPORT}`;

export function stripReportFences(markdown: string): string {
  return String(markdown ?? "")
    .replace(/^```[a-z]*\n/i, "")
    .replace(/```$/, "")
    .replace(/\n?##\s*END\s*$/i, "")
    .trim();
}
