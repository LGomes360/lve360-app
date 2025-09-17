// src/lib/generateStack.ts
import { getOpenAiClient } from "./openai";
import { supabaseAdmin } from "./supabase";

/**
 * Generate a stack for a submission or input.
 */
export async function generateStackForInput(input: any) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase envs not configured");
  }

  const openai = getOpenAiClient();
  const prompt = `Generate supplement stack for input: ${JSON.stringify(input)}`;

  const aiResp = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: prompt,
  });

  // Optionally persist
  // await supabaseAdmin.from("stacks").insert([{ input, aiResp }]);

  return aiResp;
}

export default generateStackForInput;
