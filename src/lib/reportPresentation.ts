export const REPORT_THEME = {
  navy: "#122945",
  teal: "#06C1A0",
  slate: "#1F2937",
  muted: "#64748B",
  paleTeal: "#E6F7F3",
  paleBlue: "#EFF5FA",
  paleAmber: "#FFF4D6",
  border: "#D1DBE0",
} as const;

export const REPORT_THEME_RGB = {
  navy: [18 / 255, 41 / 255, 69 / 255] as const,
  teal: [6 / 255, 193 / 255, 160 / 255] as const,
  slate: [31 / 255, 41 / 255, 55 / 255] as const,
  muted: [100 / 255, 116 / 255, 139 / 255] as const,
  paleTeal: [230 / 255, 247 / 255, 243 / 255] as const,
  paleBlue: [239 / 255, 245 / 255, 250 / 255] as const,
  paleAmber: [255 / 255, 244 / 255, 214 / 255] as const,
  border: [209 / 255, 219 / 255, 224 / 255] as const,
} as const;

export function reportSectionTitle(title: string): string {
  return title === "Lifestyle Prescriptions" ? "Lifestyle Foundations" : title;
}

export function cleanReportDisplayText(value: string): string {
  return String(value ?? "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[:;|]+\s*/, "")
    .replace(/\bevidence\s*:\s*informed\b/gi, "evidence-informed")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function blueprintStatusTone(value: string): "current" | "review" | "new" | null {
  const status = cleanReportDisplayText(value).toLowerCase();
  if (status === "current - optimize") return "current";
  if (status === "clinician review") return "review";
  if (status === "new - consider") return "new";
  return null;
}
