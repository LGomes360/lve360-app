/* eslint-disable no-console */
// Unified OpenAI wrapper:
// - GPT-5* uses Responses API (input → input_text, max_output_tokens ≥ 16)
// - GPT-4o* / 4.x use Chat Completions (messages)
// - Normalizes result to .text and also exposes .choices for back-compat

import OpenAI from "openai";

export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;     // alias for both families
  temperature?: number;   // ignored by Responses if not supported
  timeoutMs?: number;     // default 60s
};

export type LLMResult = {
  modelUsed: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  text: string; // normalized primary output
  choices: Array<{ message: { content: string } }>; // back-compat for old callers
  raw?: any;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  // If you have a project-scoped key and want to be explicit, uncomment:
  // project: process.env.OPENAI_PROJECT,
});

function isResponsesModel(model: string) {
  return model.toLowerCase().startsWith("gpt-5");
}

function mapToolToAssistant(msgs: ChatMsg[]) {
  // Chat endpoint doesn't accept role:"tool" without tool_call_id
  return msgs.map((m) => (m.role === "tool" ? { role: "assistant", content: m.content } : m)) as any;
}

function clampResponsesMax(n?: number) {
  // Responses API rejects values < 16 (we saw this error repeatedly)
  const v = typeof n === "number" ? n : 512;
  return Math.max(16, v);
}

export async function callOpenAI(
  model: string,
  messages: ChatMsg[] | string,
  opts: CallOpts = {}
): Promise<LLMResult> {
  const msgs: ChatMsg[] = Array.isArray(messages) ? messages : [{ role: "user", content: String(messages) }];

  if (isResponsesModel(model)) {
    // GPT-5 / 5-mini → Responses API
    const resp: any = await client.responses.create({
      model,
      input: msgs.map((m) => ({
        role: m.role === "tool" ? "assistant" : m.role,
        content: [{ type: "input_text", text: m.content }],
      })),
      max_output_tokens: clampResponsesMax(opts.maxTokens),
      // IMPORTANT: do NOT send `modalities`, `response_format`, or `text.format`
    });

    const outText =
      typeof resp.output_text === "string"
        ? resp.output_text
        : (resp.output?.map?.((x: any) => x?.content?.[0]?.text ?? "").join("") ?? "");

    const usage = resp.usage ?? {};
    const promptTokens = usage.input_tokens ?? usage.prompt_tokens ?? null;
    const completionTokens = usage.output_tokens ?? usage.completion_tokens ?? null;
    const totalTokens =
      usage.total_tokens ?? (promptTokens && completionTokens ? promptTokens + completionTokens : null);

    const text = String(outText || "").trim();

    return {
      modelUsed: resp.model ?? model,
      promptTokens,
      completionTokens,
      totalTokens,
      text,
      choices: [{ message: { content: text } }],
      raw: resp,
    };
  }

  // GPT-4o / 4.x → Chat Completions
  const resp = await client.chat.completions.create({
    model,
    messages: mapToolToAssistant(msgs),
    ...(typeof opts.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
    ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
  });

  const text = (resp.choices?.[0]?.message?.content ?? "").trim();

  return {
    modelUsed: (resp as any).model ?? model,
    promptTokens: resp.usage?.prompt_tokens ?? null,
    completionTokens: resp.usage?.completion_tokens ?? null,
    totalTokens: resp.usage?.total_tokens ?? null,
    text,
    choices: resp.choices as any,
    raw: resp,
  };
}

// Small helper if you prefer a one-liner to read the normalized text.
export function pickText(res: LLMResult) {
  return (res.text || res.choices?.[0]?.message?.content || "").trim();
}
