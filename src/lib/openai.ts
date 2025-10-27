// src/lib/openai.ts
// Lazy OpenAI initializer + hardened Responses API wrapper.
// Back-compat: accepts legacy opts like max_tokens / maxTokens but never forwards them.

type OpenAIClient = any;

let _client: OpenAIClient | null = null;

export function getOpenAI(): OpenAIClient {
  if (_client) return _client;

  const key = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY — set it in your env.");

  // dynamic require to avoid build-time issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require("openai");
  const OpenAI = (pkg && pkg.default) ? pkg.default : pkg;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export const getOpenAiClient = getOpenAI;
export default getOpenAI;

// ---------------- LLM wrapper (Responses API) ----------------

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

type LLMOpts = {
  max?: number;                 // preferred
  maxTokens?: number;           // legacy alias
  max_tokens?: number;          // legacy alias
  temperature?: number;
  response_format?: { type: "text" | "json_object" } | undefined;
};

export async function callLLM(
  messages: LLMMessage[],
  model: string,
  opts: LLMOpts = {}
) {
  const client = getOpenAI();

  // Accept any of the names, prefer opts.max
  const resolvedMax =
    (typeof opts.max === "number" ? opts.max : undefined) ??
    (typeof (opts as any).maxTokens === "number" ? (opts as any).maxTokens : undefined) ??
    (typeof (opts as any).max_tokens === "number" ? (opts as any).max_tokens : undefined) ??
    1800;

  const temperature =
    typeof opts.temperature === "number" ? opts.temperature : 0.2;

  // Guard rails: warn if someone is still passing max_tokens
  if (typeof (opts as any).max_tokens !== "undefined") {
    console.warn("[callLLM] Ignoring legacy 'max_tokens'; using max_completion_tokens instead.");
  }

  // Build Responses API payload WITHOUT spreading opts (to avoid leaking unsupported fields)
  const payload: any = {
    model,
    messages,
    max_completion_tokens: resolvedMax,    // <- required for gpt-5 family
    temperature,
  };
  if (opts.response_format) payload.response_format = opts.response_format;

  const resp = await client.responses.create(payload);

  const text = (resp.output_text ?? "").trim();

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
    choices: [{ message: { content: text } }], // back-compat with Chat Completions
    llmRaw: resp,
  };
}

export function getText(resp: any): string {
  return resp?.choices?.[0]?.message?.content ?? "";
}
