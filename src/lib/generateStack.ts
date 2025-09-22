// src/lib/generateStack.ts
// -----------------------------------------------------------------------------
// 2-pass pipeline with safe fallback:
//   1) Try JSON → Markdown
//   2) If JSON parse fails, salvage Markdown from raw text
//   3) If that fails, fallback to old Markdown-first style
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
  const today = new Date("2025-09-21"); // lock for consistency
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/* ---------------------- Stage 1 JSON prompt ---------------------- */
function buildJsonPrompt(sub: SubmissionWithChildren) {
  const age = calculateAge((sub as any).dob ?? null);
  return [
    "# LVE360 Blueprint Report — Stage 1 (JSON)",
    "Return only valid JSON (no prose). Keys: summary, goals, contraindications, currentStackReview, blueprintRecommendations, recommendedStack, dosingNotes, evidence, shoppingLinks, followUp, lifestyle, longevityLevers, weeklyTry.",
    "",
    "Submission:",
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
      medications: sub.medications ?? [],
      supplements: sub.supplements ?? [],
      hormones: sub.hormones ?? [],
    }),
  ].join("\n\n");
}

/* ---------------------- Stage 2 Markdown ---------------------- */
function jsonToMarkdown(data: any) {
  try {
    const out: string[] = [];
    out.push("## Summary\n" + (data.summary ?? ""));
    out.push("## Goals\n" + (data.goals ?? ""));
    out.push("## Contraindications & Med Interactions\n" + JSON.stringify(data.contraindications ?? []));
    out.push("## Current Stack\n" + (data.currentStackReview ?? ""));
    out.push("## Your Blueprint Recommendations\n" + JSON.stringify(data.blueprintRecommendations ?? []));
    out.push("## Recommended Stack\n" + JSON.stringify(data.recommendedStack ?? []));
    out.push("## Dosing & Notes\n" + (data.dosingNotes ?? ""));
    out.push("## Evidence & References\n" + JSON.stringify(data.evidence ?? []));
    out.push("## Shopping Links\n" + JSON.stringify(data.shoppingLinks ?? []));
    out.push("## Follow-up Plan\n" + (data.followUp ?? ""));
    out.push("## Lifestyle Prescriptions\n" + JSON.stringify(data.lifestyle ?? {}));
    out.push("## Longevity Levers\n" + JSON.stringify(data.longevityLevers ?? []));
    out.push("## This Week Try\n" + (data.weeklyTry ?? ""));
    out.push("## END");
    return out.join("\n\n");
  } catch {
    return "";
  }
}

/* ---------------------- Main ---------------------- */
export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY not configured");

  const submission = await getSubmissionWithChildren(submissionId);

  // Init OpenAI
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

  /* ---------- Stage 1: JSON ---------- */
  const jsonResp = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: buildJsonPrompt(submission),
    temperature: 0.6,
  });

  let rawText = "";
  try {
    rawText =
      (jsonResp as any).output_text ??
      (Array.isArray((jsonResp as any).output) &&
        (jsonResp as any).output[0]?.content?.[0]?.text) ??
      "";
  } catch {
    rawText = "";
  }

  let parsed: any = null;
  let markdown = "";

  try {
    parsed = JSON.parse(rawText);
    markdown = jsonToMarkdown(parsed);
  } catch {
    console.warn("JSON parse failed, salvaging raw text...");
    markdown = rawText; // at least display something
  }

  /* ---------- Fallback if still empty ---------- */
  if (!markdown || markdown.trim().length < 50) {
    markdown = [
      "## Summary\nReport generated but lacked structure.",
      "## Goals\nNo detailed goals provided.",
      "## Your Blueprint Recommendations\n| Rank | Supplement | Why it matters |\n|------|------------|----------------|\n| 1 | Placeholder | Parsing failed |",
      "## END",
    ].join("\n\n");
  }

  return { markdown, raw: jsonResp };
}

export default generateStackForSubmission;
