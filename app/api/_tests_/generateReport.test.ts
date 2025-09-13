import { describe, it, expect } from "vitest"; // swap to jest if that's your runner
import { ReportInput, buildReportPromptFromSpec } from "../src/lib/generateReport";

// Fake submission for testing
const fakeSubmission: ReportInput = {
  id: "test123",
  email: "test@example.com",
  goals: ["weight loss", "better sleep"],
  healthConditions: ["high blood pressure"],
  medications: ["lisinopril"],
  supplements: ["vitamin d", "fish oil"],
  hormones: ["testosterone"],
  tier: "mid",
  dob: "1990-01-01",
  sex: "male",
  pregnant: "no",
  weight: 180,
  height: "5'10\"",
  energy_rating: 3,
  sleep_rating: 2,
  dosing_pref: "AM",
  brand_pref: "budget brands",
};

// The 9 required section headers
const sections = [
  "## Section 1. Current Analysis",
  "## Section 2. Contraindications",
  "## Section 3. Bang-for-Buck",
  "## Section 4. Personalized Stack",
  "## Section 5. Lifestyle Advice",
  "## Section 6. Longevity Notes",
  "## Section 7. This Week, Try",
  "## Section 8. Dashboard Snapshot",
  "## Section 9. Disclaimers",
];

describe("buildReportPromptFromSpec", () => {
  it("includes all 9 sections in detailed mode", () => {
    const prompt = buildReportPromptFromSpec(fakeSubmission, "detailed");
    for (const header of sections) {
      expect(prompt).toContain(header);
    }
  });

  it("includes all 9 sections in busy mode", () => {
    const prompt = buildReportPromptFromSpec(fakeSubmission, "busy");
    for (const header of sections) {
      expect(prompt).toContain(header);
    }
  });
});
