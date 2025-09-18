// src/lib/generateReport.ts
import { supabaseAdmin } from "@/lib/supabase";

/**
 * generateReport(submissionId)
 * - Loads submission and calls OpenAI Responses API to generate a report.
 * - This file DOES NOT instantiate OpenAI at module-load; the factory is resolved inside the function.
 */

export default async function generateReport(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");

  // Load submission
  const { data: submission, error: subErr } = await supabaseAdmin
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (subErr || !submission) {
    throw new Error("submission not found");
  }

  // Lazy-init OpenAI at runtime — do NOT import or call any factory at module top-level
  let openai: any = null;
  try {
    // Try local factory/module first (src/lib/openai)
    const localMod: any = await import("./openai").catch(() => null);

    if (localMod) {
      if (typeof localMod.getOpenAiClient === "function") {
        openai = localMod.getOpenAiClient();
      } else if (typeof localMod.getOpenAI === "function") {
        openai = localMod.getOpenAI();
      } else if (localMod.default) {
        const Def = localMod.default;
        // If default is a constructor/class, instantiate it; otherwise accept instance
        openai = typeof Def === "function" ? new Def({ apiKey: process.env.OPENAI_API_KEY }) : Def;
      }
    }

    // Fallback: dynamic import of the official SDK
    if (!openai) {
      const OpenAIMod: any = await import("openai");
      const OpenAIDef = OpenAIMod?.default ?? OpenAIMod;
      openai = typeof OpenAIDef === "function" ? new OpenAIDef({ apiKey: process.env.OPENAI_API_KEY }) : OpenAIDef;
    }

    if (!openai) throw new Error("OpenAI initialization failed");
  } catch (e: any) {
    throw new Error("OpenAI client unavailable: " + (e?.message ?? String(e)));
  }

  // Build prompt (customize as needed)
  const prompt = `Generate LVE360 report for submission:\n\n${JSON.stringify(submission, null, 2)}`;

  // Call OpenAI Responses API
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: prompt,
  });

  // Extract text defensively
  let outputText = "";
  try {
    if (typeof response === "string") outputText = response;
    else if (response.output_text) outputText = response.output_text;
    else if (Array.isArray(response.output) && response.output.length) {
      const first = response.output[0];
      if (typeof first === "string") outputText = first;
      else if (first?.content) {
        if (Array.isArray(first.content)) {
          outputText = first.content
            .map((c: any) => c.text ?? (Array.isArray(c.parts) ? c.parts.join("") : ""))
            .join("\n");
        } else if (typeof first.content === "string") {
          outputText = first.content;
        } else {
          outputText = JSON.stringify(first.content);
        }
      } else {
        outputText = JSON.stringify(first);
      }
    } else {
      outputText = JSON.stringify(response);
    }
  } catch (err) {
    outputText = JSON.stringify(response);
  }

  const usage = response?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const totalTokensRaw = usage.total_tokens;
  const totalTokens = Number(totalTokensRaw != null ? totalTokensRaw : promptTokens + completionTokens);

  // Return structured result (caller can persist)
  return {
    submission,
    markdown: outputText,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
    raw: response,
  };
}
