import OpenAI from "openai";
import { supabaseAdmin } from "./supabase";
import { getSubmissionWithChildren } from "./getSubmissionWithChildren";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Schema validation for normalized submission
const InputSchema = z.object({
  submission_id: z.string(),
  profile: z.object({
    name: z.string().optional(),
    dob: z.string().optional(),
    gender: z.string().optional(),
    height: z.string().optional(),
    weight_lb: z.number().optional(),
  }),
  contact: z.object({
    email: z.string().optional(),
    address: z.string().optional(),
  }),
  goals: z.array(z.string()).default([]),
  behaviors: z.record(z.any()).optional(),
  conditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  current_supplements: z.array(
    z.object({ name: z.string(), dose: z.string().optional(), timing: z.string().optional() })
  ).default([]),
  preferences: z.record(z.any()).optional(),
  self_ratings: z.record(z.any()).optional(),
  date_iso: z.string().optional(),
});

export async function generateReport(submissionId: string) {
  // 1. Load submission w/ children from Supabase
  const submission = await getSubmissionWithChildren(submissionId);

  // 2. Validate/normalize
  const parsed = InputSchema.parse(submission);

  // 3. Build prompt per spec:contentReference[oaicite:1]{index=1}
  const prompt = `
SYSTEM: You are a wellness concierge for LVE360. Generate a branded, client-ready report.
BOUNDARIES: DSHEA/FTC compliant; plain English; guardrails not warnings.
STYLE: Professional, concise, friendly. Include "why it matters". Respect Busy-Pro mode.
OUTPUT ORDER: 1) Current Analysis 2) Contraindications 3) Bang-for-Buck 4) Stack 5) Lifestyle 6) Longevity 7) This Week Try 8) Dashboard 9) Disclaimers
TABLE RULES: Total width 6.9", wrapped text, header teal/white, light grid.

INPUT JSON:
${JSON.stringify(parsed, null, 2)}

TASK: Parse → run modules → produce the 9 sections. 
Each supplement line should include a short 'why it matters' and at least one citation.
Avoid disease claims; use phrasing like "research suggests" or "many people find". 
Always end with a DSHEA disclaimer.
`;

  // 4. Call LLM
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    messages: [
      { role: "system", content: "You are LVE360's wellness concierge." },
      { role: "user", content: prompt },
    ],
  });

  const body = completion.choices[0].message?.content?.trim() ?? "";

  // 5. Save to Supabase
  const { data, error } = await supabaseAdmin
    .from("reports")
    .insert({
      submission_id: submissionId,
      body,
      generated_by: "llm",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Error saving report:", error);
    return { body, saved: false };
  }

  return { body, saved: true, id: data.id };
}
