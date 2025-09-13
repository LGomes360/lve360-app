export interface SectionConfig {
  header: string;
  premiumOnly: boolean;
}

export const sectionsConfig: SectionConfig[] = [
  { header: "Section 1. Current Analysis", premiumOnly: false },
  { header: "Section 2. Contraindications", premiumOnly: false },
  { header: "Section 3. Bang-for-Buck", premiumOnly: false },
  { header: "Section 4. Personalized Stack", premiumOnly: true },
  { header: "Section 5. Lifestyle Advice", premiumOnly: true },
  { header: "Section 6. Longevity Notes", premiumOnly: true },
  { header: "Section 7. This Week, Try", premiumOnly: true },
  { header: "Section 8. Dashboard Snapshot", premiumOnly: true },
  { header: "Section 9. Disclaimers", premiumOnly: true },
];
