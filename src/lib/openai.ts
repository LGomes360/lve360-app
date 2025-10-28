// src/lib/openai.ts
// Lazy OpenAI initializer + hardened Responses API wrapper.
// Back-compat: accepts legacy opts like max_tokens / maxTokens but never forwards them to the API.

type OpenAIClient = any;

let _client: OpenAIClient | null = null;

/** Model capability hints so we never send unsupported params */
const MODEL_CAPS = {
  "gpt-5-mini":  { acceptsTemperature: false, maxKey: "max_output_tokens" },     // Responses API
  "gpt-5":       { acceptsTemperature: true,  maxKey: "max_output_tokens" },     // Responses API
  "gpt-4o":      { acceptsTemperature: true,  maxKey: "max_tokens" },            // Chat-style compat
  "gpt-4o-mini": { acceptsTemperature: true,  maxKey: "max_tokens" },            // Chat-style compat
} as const;

function capsFor(model: string) {
  const key = (Object.keys(MODEL_CAPS) as string[]).find(k => model.startsWith(k));
  return key ? (MODEL_CAPS as any)[key] : { acceptsTemperature: false, maxKey: "max_output_tokens" };
}

export function getOpenAI(): OpenAIClient {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY as string;
  if (!key) throw new Error("Missing OPENAI_API_KEY — set it in your env.");

  // dynamic require to avoid build-time bundling issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("openai");
  const OpenAI = (mod && mod.default) ? mod.default : mod;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export const getOpenAiClient = getOpenAI;
export default getOpenAI;

// ---------------- LLM wrapper (Responses API) ----------------

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

type LLMOpts = {
  max?: number;                 // preferred
  maxTokens?: number;           // legacy alias (int)
  max_tokens?: number;          // legacy alias (snake)
  temperature?: number;
  response_format?: { type: "text" | "json_object" } | undefined;
};

function buildPayload(
  model: string,
  messages: LLMMessage[],
  opts: LLMOpts
) {
  const caps = capsFor(model);

  // Normalize max tokens from any legacy shape; default sane budget for 5-series
  const resolvedMax =
    (typeof opts.max === "number" && opts.max) ||
    (typeof opts.maxTokens === "number" && opts.maxTokens) ||
    (typeof opts.max_tokens === "number" && opts.max_tokens) ||
    1800;

  // Guard rails: warn on legacy field
  if (typeof opts.max_tokens !== "undefined") {
    console.warn("[callLLM] Ignoring legacy 'max_tokens'; using", caps.maxKey);
  }

const payload: any = {
  model,
  // Responses API requires `input` (not `messages`).
  // We pass your chat-like array through; the SDK accepts arrays of role/content.
  input: messages,
};


  // Apply the correct max token key for the model family
  if (caps.maxKey === "max_output_tokens") {
    payload.max_output_tokens = resolvedMax;
  } else if (caps.maxKey === "max_completion_tokens") {
    payload.max_completion_tokens = resolvedMax;
  } else {
    payload.max_tokens = resolvedMax;
  }

  // Temperature only where supported
  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    payload.temperature = opts.temperature;
  }

  if (opts.response_format) {
    payload.response_format = opts.response_format;
  }

  return payload;
}

function extractText(resp: any) {
  // 1) Responses API convenience field
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }
  // 2) Responses API: content array
  if (Array.isArray(resp?.content)) {
    const text = resp.content.map((seg: any) => seg?.text ?? seg?.content ?? "").join("");
    if (text && text.trim()) return text.trim();
  }
  // 3) Responses API: output array (older)
  if (Array.isArray(resp?.output)) {
    const text = resp.output.map((seg: any) => seg?.text ?? seg?.content ?? "").join("");
    if (text && text.trim()) return text.trim();
  }
  // 4) Chat-style fallback (just in case upstream uses choices[])
  const c = resp?.choices?.[0]?.message?.content;
  if (c) {
    const text = Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : String(c);
    if (text && text.trim()) return text.trim();
  }
  return "";
}

export async function callLLM(
  messages: LLMMessage[],
  model: string,
  opts: LLMOpts = {}
) {
  const client = getOpenAI();

  const payload = buildPayload(model, messages, opts);
  const resp = await client.responses.create(payload);

  const text = extractText(resp);

  const usage = resp?.usage
    ? {
        total_tokens: resp.usage.total_tokens,
        prompt_tokens: resp.usage.input_tokens,
        completion_tokens: resp.usage.output_tokens,
      }
    : undefined;

  // Return in a Chat-compatible shape so existing callers keep working
  return {
    model: resp?.model ?? model,
    usage,
    choices: [{ message: { content: text } }],
    llmRaw: resp,
  };
}

/** Back-compat helper for callers expecting Chat-like object */
export function getText(resp: any): string {
  return (resp?.choices?.[0]?.message?.content ?? "").trim();
}
