// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// Dual-channel pipeline with strong constraints for LVE360 Blueprint Reports
//   1) Model outputs JSON object AND full Markdown
//   2) JSON enforces structure; Markdown ensures readability
//   3) Hard rules: >=10 Blueprint Recs, bullets+narrative, citations per rec
// -----------------------------------------------------------------------------

import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";

const MAX_PROMPT_CHARS = 28_000;

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date("2025-09-21"); // lock date for consistency
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/* ---------------------- Dual-channel prompt ---------------------- */
function buildDualPrompt(sub: SubmissionWithChildren) {
  const age = calculateAge((sub as any).dob ?? null);

  return [
    "# LVE360 Blueprint Report Request",
    "",
    "You must return TWO outputs in this order:",
    "1. A valid JSON object (no prose outside braces).",
    "2. A Markdown block wrapped in ```md ... ``` with the full report.",
    "",
    "### JSON Schema (minimum expectations)",
    safeStringify({
      summary: "Narrative summary incl. demographics (DOB, Age, Sex, Wt, Ht, Email).",
      goals: {
        narrative: "Paragraph coaching tone.",
        bullets: ["Goal1", "Goal2"],
      },
      contraindications: [
        { medication: "string", concern: "string", guardrail: "string" },
      ],
      currentStack: {
        narrative: "Paragraph reviewing current supplements.",
        bullets: ["Keep", "Adjust", "Remove"],
      },
      blueprintRecommendations: Array.from({ length: 10 }).map((_, i) => ({
        rank: i + 1,
        supplement: "string",
        bullets: ["1-2 key bullet points"],
        narrative: "1-2 sentence rationale why it matters.",
        citation: "PubMed/DOI link",
      })),
      recommendedStack: [
        { supplement: "string", dose: "string", timing: "AM/PM/Bedtime", notes: "string" },
      ],
      dosingNotes: "Narrative covering AM/PM/Bedtime incl. meds & hormones.",
      evidence: [
        { supplement: "string", citation: "PubMed/DOI", summary: "short evidence blurb" },
      ],
      shoppingLinks: [{ supplement: "string", url: "https:// or [Link unavailable]" }],
      followUp: "Concrete cadence (labs, logs, recheck).",
      lifestyle: {
        nutrition: ["bullet1", "bullet2", "bullet3"],
        sleep: ["bullet1", "bullet2"],
        exercise: ["bullet1", "bullet2"],
        focus: ["bullet1"],
        monitoring: ["bullet1"],
      },
      longevityLevers: ["habit1", "habit2", "habit3", "habit4"],
      weeklyTry: "exactly 1 practical 7-day experiment",
    }),
    "",
    "### Markdown Rules",
    "- Must include all 13 sections below, in this strict order, ending with ## END:",
    "  ## Summary",
    "  ## Goals",
    "  ## Contraindications & Med Interactions",
    "  ## Current Stack",
    "  ## Your Blueprint Recommendations",
    "  ## Recommended Stack",
    "  ## Dosing & Notes",
    "  ## Evidence & References",
    "  ## Shopping Links",
    "  ## Follow-up Plan",
    "  ## Lifestyle Prescriptions",
    "  ## Longevity Levers",
    "  ## This Week Try",
    "  ## END",
    "",
    "- In **Your Blueprint Recommendations**, output at least 10 rows, ranked 1..N.",
    "- Each row: Rank | Supplement | Bullets + short narrative | Citation link.",
    "- In **Goals** and **Current Stack**, combine narrative + bullets.",
    "- In **Evidence & References**, map each Blueprint item to ≥1 PubMed/DOI with a 1-sentence summary.",
    "- Tone: professional, supportive, evidence-based, DSHEA/FTC-compliant.",
    "",
    "### Submission Data",
    safeStringify({
      id: sub.id,
      name: (sub as any).name ?? null,
      sex: (sub as any).sex ?? null,
      dob: (sub as any).dob ?? null,
      age,
      weight: (sub as any).weight ?? null,
      height: (sub as any).height ?? null,
      goals: (sub as any).goals ?? null,
      energy_rating: (sub as any).energy_rating ?? null,
      sleep_rating: (sub as any).sleep_rating ?? null,
      allergies: (sub as any).allergies ?? null,
      allergy_details: (sub as any).allergy_details ?? null,
      dosing_pref: (sub as any).dosing_pref ?? null,
      brand_pref: (sub as any).brand_pref ?? null,
      answers: (sub as any).answers ?? null,
      email: (sub as any).user_email ?? null,
      medications: sub.medications ?? [],
      supplements: sub.supplements ?? [],
      hormones: sub.hormones ?? [],
    }),
  ].join("\n\n");
}

/* ---------------------- Markdown extractor ---------------------- */
function extractMarkdown(rawText: string): string {
  const match = rawText.match(/```md([\s\S]*?)```/i);
  if (match) return match[1].trim();
  return rawText;
}

/* ---------------------- Main ---------------------- */
export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const submission = await getSubmissionWithChildren(submissionId);

  // Init OpenAI client
  let openai: any;
  try {
    const mod: any = await import("./openai").catch(() => null);
    if (mod?.getOpenAiClient) openai = mod.getOpenAiClient();
    else {
      const OpenAIMod: any = await import("openai");
      const Def = OpenAIMod?.default ?? OpenAIMod;
      openai = new Def({ apiKey: process.env.OPENAI_API_KEY });
    }
  } catch (e: any) {
    throw new Error("OpenAI init failed: " + String(e?.message ?? e));
  }

  // Call model
  const resp = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: buildDualPrompt(submission),
    temperature: 0.6,
  });

  let rawText = "";
  try {
    rawText =
      (resp as any).output_text ??
      (Array.isArray((resp as any).output) &&
        (resp as any).output[0]?.content?.[0]?.text) ??
      "";
  } catch {
    rawText = "";
  }

  // Extract Markdown
  let markdown = extractMarkdown(rawText);

  // Safety net
  if (!markdown.includes("## END")) {
    markdown += "\n\n## END";
  }

  return { markdown, raw: resp };
}

export default generateStackForSubmission;
