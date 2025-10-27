// src/lib/openai.ts
// Lazy OpenAI initializer + Responses API wrapper that is back-compat with your code.

type OpenAIClient = any;

let _client: OpenAIClient | null = null;

export function getOpenAI(): OpenAIClient {
  if (_client) return _client;

  const key = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY — set it in your env.");
  }

  // dynamic require to avoid build-time import issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require("openai");
  const OpenAI = (pkg && pkg.default) ? pkg.default : pkg;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

// Legacy alias to satisfy older imports in the repo.
export const getOpenAiClient = getOpenAI;
export default getOpenAI;

// ---------------- LLM wrapper (Responses API) ----------------

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LLMOpts = {
  max?: number;               // completion tokens cap
  temperature?: number;
  response_format?: { type: "text" | "json_object" } | undefined;
};

/**
 * callLLM(messages, model, opts?)
 * Uses the Responses API (required by gpt-5 / gpt-5-mini).
 * Returns a shape compatible with Chat Completions so existing code works:
 *   resp.choices[0].message.content
 *   resp.usage.prompt_tokens / completion_tokens / total_tokens
 */
export async function callLLM(
  messages: LLMMessage[],
  model: string,
  opts: LLMOpts = {}
) {
  const client = getOpenAI();
  const max = opts.max ?? 1800;
  const temperature = opts.temperature ?? 0.2;

  // Prefer Responses API for all models; it also works for 4o these days.
  const resp = await client.responses.create({
    model,
    messages,
    max_completion_tokens: max,           // <-- critical for gpt-5 family
    temperature,
    response_format: opts.response_format, // keep undefined for markdown
  });

  // Normalize into your existing shape
  const text: string = (resp.output_text ?? "").trim();

  const usage = resp.usage
    ? {
        total_tokens: resp.usage.total_tokens,
        prompt_tokens: resp.usage.input_tokens,
        completion_tokens: resp.usage.output_tokens,
      }
    : undefined;

  return {
    model: resp.model,
    usage,
    // mimic Chat Completions choice structure
    choices: [{ message: { content: text } }],
    llmRaw: resp,
  };
}

/**
 * Helper to read the primary text safely.
 */
export function getText(resp: any): string {
  return resp?.choices?.[0]?.message?.content ?? "";
}
