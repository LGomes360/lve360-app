// src/lib/generateReport.ts
// Exports a single function to generate a report using OpenAI and Supabase.
// Avoids instantiating OpenAI at module-load.

import { getOpenAiClient } from "./openai";
import { supabaseAdmin } from "./supabase";

export async function generateReportForSubmission(submissionId: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase envs not configured");
  }

  const openai = getOpenAiClient();

  // Read submission
  const { data: submission, error } = await supabaseAdmin.from("submissions").select("*").eq("id", submissionId).single();
  if (error) throw error;

  // Create a prompt from the submission (placeholder)
  const prompt = `Create a report for submission: ${JSON.stringify(submission)}`;

  const aiResp = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: prompt,
  });

  // Optionally store
  // await supabaseAdmin.from("reports").insert([{ submission_id: submissionId, ai: aiResp }]);

  return { submission, aiResp };
}

export default generateReportForSubmission;
