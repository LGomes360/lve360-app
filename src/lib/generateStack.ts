// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// Generate a supplement "stack" report via a 2-pass pipeline:
//   1) Ask OpenAI for structured JSON (sections, recs, rationale, citations).
//   2) Reformat JSON → strict Markdown with 13 sections + sentinel `## END`.
// -----------------------------------------------------------------------------
//
// Sections (strict order):
//   ## Summary
//   ## Goals
//   ## Contraindications & Med Interactions
//   ## Current Stack
//   ## Your Blueprint Recommendations
//   ## Recommended Stack
//   ## Dosing & Notes
//   ## Evidence & References
//   ## Shopping Links
//   ## Follow-up Plan
//   ## Lifestyle Prescriptions
//   ## Longevity Levers
//   ## This Week Try
//   ## END
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

// Compute age from DOB string
function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date("2025-09-21"); // locked for consistency
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/* ----------------------------- PROMPTS ----------------------------- */

// Stage 1: JSON-first schema
function buildJsonPrompt(sub: SubmissionWithChildren) {
  const age = calculateAge((sub as any).dob ?? null);

  return [
    "# LVE360 Blueprint Report — Stage 1 (JSON)",
    "Return a single valid JSON object (no prose) with these fields:",
    safeStringify({
      summary: "string narrative (demographics, DOB, Age, key context)",
      goals: "expanded narrative of user’s goals",
      contraindications: [
        { medication: "string", concern: "string", guardrail: "string" },
      ],
      currentStackReview:
        "narrative review of supplements they already take, pros/cons, redundancies",
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
      dosingNotes:
        "include medications + hormones with timing/notes; clarify integration",
      evidence: [
        { supplement: "string", citation: "PubMed ID or link", summary: "string" },
      ],
      shoppingLinks: [
        { supplement: "string", url: "https:// or [Link unavailable]" },
      ],
      followUp: "cadence for labs/check-ins; what to monitor",
      lifestyle: {
        nutrition: ["bullet1", "bullet2"],
        sleep: ["bullet1"],
        exercise: ["bullet1"],
        focus: ["bullet1"],
        monitoring: ["bullet1"],
      },
      longevityLevers: ["habit1", "habit2", "habit3"],
      weeklyTry: "one concrete 7-day experiment",
    }),
    "",
    "Constraints:",
    "- Output must be pure JSON, no Markdown, no explanations.",
    "- Populate fields using submission data provided.",
    "- Use quiz fields: goals, conditions, allergies, sleep_rating, energy_rating, dosing_pref, brand_pref, etc.",
    "- Evidence: at least one citation per recommended supplement.",
    "",
    "Submission data (for context):",
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

// Stage 2: Convert JSON → Markdown
function jsonToMarkdown(data: any) {
  let out: string[] = [];

  out.push("## Summary\n" + (data.summary ?? ""));
  out.push("## Goals\n" + (data.goals ?? ""));

  if (data.contraindications?.length) {
    out.push(
      "## Contraindications & Med Interactions\n\n| Medication | Concern | Guardrail |\n|------------|---------|-----------|\n" +
        data.contraindications
          .map(
            (c: any) => `| ${c.medication} | ${c.concern} | ${c.guardrail} |`
          )
          .join("\n")
    );
  }

  out.push("## Current Stack\n" + (data.currentStackReview ?? ""));

  if (data.blueprintRecommendations?.length) {
    out.push(
      "## Your Blueprint Recommendations\n\n| Rank | Supplement | Why it matters |\n|------|------------|----------------|\n" +
        data.blueprintRecommendations
          .map(
            (r: any) => `| ${r.rank} | ${r.supplement} | ${r.why ?? ""} |`
          )
          .join("\n")
    );
  }

  if (data.recommendedStack?.length) {
    out.push(
      "## Recommended Stack\n\n| Supplement | Dose | Timing | Notes |\n|------------|------|--------|-------|\n" +
        data.recommendedStack
          .map(
            (r: any) =>
              `| ${r.supplement} | ${r.dose ?? ""} | ${r.timing ?? ""} | ${r.notes ?? ""} |`
          )
          .join("\n")
    );
  }

  out.push("## Dosing & Notes\n" + (data.dosingNotes ?? ""));

  if (data.evidence?.length) {
    out.push(
      "## Evidence & References\n\n" +
        data.evidence
          .map(
            (e: any) =>
              `- **${e.supplement}** — ${e.summary ?? ""} ([Link](${e.citation}))`
          )
          .join("\n")
    );
  }

  if (data.shoppingLinks?.length) {
    out.push(
      "## Shopping Links\n\n" +
        data.shoppingLinks
          .map((s: any) => `- ${s.supplement}: ${s.url}`)
          .join("\n")
    );
  }

  out.push("## Follow-up Plan\n" + (data.followUp ?? ""));

  if (data.lifestyle) {
    out.push("## Lifestyle Prescriptions");
    Object.entries(data.lifestyle).forEach(([k, v]) => {
      out.push(`### ${k[0].toUpperCase() + k.slice(1)}\n- ${(v as any[]).join("\n- ")}`);
    });
  }

  if (data.longevityLevers?.length) {
    out.push(
      "## Longevity Levers\n" +
        data.longevityLevers.map((l: any) => `- ${l}`).join("\n")
    );
  }

  out.push("## This Week Try\n" + (data.weeklyTry ?? ""));
  out.push("## END");

  return out.join("\n\n");
}

/* ----------------------------- MAIN ----------------------------- */

export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is not configured");

  const submission = await getSubmissionWithChildren(submissionId);

  // Init OpenAI client
  let openai: any = null;
  try {
    const localMod: any = await import("./openai").catch(() => null);
    if (localMod) {
      if (typeof localMod.getOpenAiClient === "function") openai = localMod.getOpenAiClient();
      else if (typeof localMod.getOpenAI === "function") openai = localMod.getOpenAI();
      else if (localMod.default) {
        const Def = localMod.default;
        openai = typeof Def === "function" ? new Def({ apiKey: process.env.OPENAI_API_KEY }) : Def;
      }
    }
    if (!openai) {
      const OpenAIMod: any = await import("openai");
      const OpenAIDef = OpenAIMod?.default ?? OpenAIMod;
      openai = typeof OpenAIDef === "function" ? new OpenAIDef({ apiKey: process.env.OPENAI_API_KEY }) : OpenAIDef;
    }
    if (!openai) throw new Error("OpenAI initialization failed");
  } catch (e: any) {
    throw new Error(`OpenAI init failed: ${String(e?.message ?? e)}`);
  }

  // Stage 1: JSON
  const jsonResp = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: buildJsonPrompt(submission),
    temperature: 0.6,
  });

  let parsed: any = null;
  try {
    const rawText =
      (jsonResp as any).output_text ??
      (Array.isArray((jsonResp as any).output) && (jsonResp as any).output[0]?.content?.[0]?.text) ??
      "";
    parsed = JSON.parse(rawText);
  } catch (err) {
    console.warn("Failed to parse JSON, falling back:", err);
    parsed = {};
  }

  // Stage 2: Markdown
  let markdown = jsonToMarkdown(parsed);

  // Fallback if empty
  if (!markdown || markdown.trim().length === 0) {
    markdown = `## Report Unavailable

Sorry — our AI assistant couldn’t generate your report this time.  
Please [contact support](https://lve360.com/helpdesk) and share your submission ID.

## END`;
  }

  return { markdown, raw: jsonResp };
}

export default generateStackForSubmission;
