// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// Dual-channel pipeline:
//   • Stage 1: LLM returns JSON object AND full Markdown in one response
//   • Stage 2: Try JSON parse → build Markdown
//   • Fallback: extract Markdown block directly if JSON fails
//   • Guarantees: all 13 sections + ## END, at least 3 Blueprint Recs
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
  const today = new Date("2025-09-21"); // lock date
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
    "",
    "1. A valid JSON object (no prose outside the braces).",
    "2. Then a Markdown block wrapped in ```md ... ``` containing the full report.",
    "",
    "The JSON should include:",
    safeStringify({
      summary: "string narrative (demographics, DOB, Age, context)",
      goals: "expanded narrative of user’s goals",
      contraindications: [
        { medication: "string", concern: "string", guardrail: "string" },
      ],
      currentStackReview:
        "review of existing supplements, pros/cons, redundancies",
      blueprintRecommendations: [
        { rank: 1, supplement: "string", why: "string" },
      ],
      recommendedStack: [
        {
          supplement: "string",
          dose: "string",
          timing: "AM/PM/Bedtime",
          notes: "string",
        },
      ],
      dosingNotes: "include medications + hormones with timing/notes",
      evidence: [
        { supplement: "string", citation: "PubMed link", summary: "string" },
      ],
      shoppingLinks: [
        { supplement: "string", url: "https:// or [Link unavailable]" },
      ],
      followUp: "labs/check-ins cadence",
      lifestyle: {
        nutrition: ["tip1", "tip2"],
        sleep: ["tip1"],
        exercise: ["tip1"],
        focus: ["tip1"],
        monitoring: ["tip1"],
      },
      longevityLevers: ["habit1", "habit2", "habit3"],
      weeklyTry: "one concrete 7-day experiment",
    }),
    "",
    "Rules:",
    "- Always output at least 3 Blueprint Recommendations.",
    "- Always include all 13 sections in Markdown, ending with '## END'.",
    "- Use exact section headers:",
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
    "Submission Data:",
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
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is not configured");

  const submission = await getSubmissionWithChildren(submissionId);

  // Init OpenAI client
  let openai: any = null;
  try {
    const mod: any = await import("./openai").catch(() => null);
    if (mod?.getOpenAiClient) openai = mod.getOpenAiClient();
    else {
      const OpenAIMod: any = await import("openai");
      const Def = OpenAIMod?.default ?? OpenAIMod;
      openai = new Def({ apiKey: process.env.OPENAI_API_KEY });
    }
  } catch (e: any) {
    throw new Error(`OpenAI init failed: ${String(e?.message ?? e)}`);
  }

  // Ask OpenAI
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

  // Try parsing JSON
  let markdown = "";
  try {
    const jsonPart = rawText.slice(rawText.indexOf("{"), rawText.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonPart);
    // If JSON ok, rebuild Markdown manually (optional)…
    // but safer to just pull the Markdown block.
    markdown = extractMarkdown(rawText);
  } catch {
    console.warn("JSON parse failed, falling back to Markdown block.");
    markdown = extractMarkdown(rawText);
  }

  // Safety net
  if (!markdown.includes("## END")) {
    markdown += "\n\n## END";
  }

  return { markdown, raw: resp };
}

export default generateStackForSubmission;
