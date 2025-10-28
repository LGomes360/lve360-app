// src/lib/openai.ts
// Model-aware OpenAI wrapper: 5-series → Responses API (input/max_output_tokens),
// 4o/4o-mini → Chat Completions (messages/max_tokens).
// Returns a normalized shape usable by generateStack.ts.

type OpenAIClient = any;
let _client: OpenAIClient | null = null;

function getClient(): OpenAIClient {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY as string;
  if (!key) throw new Error("Missing OPENAI_API_KEY — set it in your env.");

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require("openai");
  const OpenAI = (pkg && pkg.default) ? pkg.default : pkg;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

// ---- Model caps (what params are legal) ------------------------------------
const MODEL_CAPS: Record<string, { family: "gpt5" | "gpt4o"; acceptsTemperature: boolean; maxKey: "max_output_tokens" | "max_tokens" }> = {
  "gpt-5":       { family: "gpt5",  acceptsTemperature: true,  maxKey: "max_output_tokens" },
  "gpt-5-mini":  { family: "gpt5",  acceptsTemperature: false, maxKey: "max_output_tokens" },
  "gpt-4o":      { family: "gpt4o", acceptsTemperature: true,  maxKey: "max_tokens" },
  "gpt-4o-mini": { family: "gpt4o", acceptsTemperature: true,  maxKey: "max_tokens" },
};
function capsFor(model: string) {
  const key = Object.keys(MODEL_CAPS).find(k => model.startsWith(k));
  // Default to safe 5-series assumptions if unknown
  return key ? MODEL_CAPS[key] : { family: "gpt5" as const, acceptsTemperature: false, maxKey: "max_output_tokens" as const };
}

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };
type LLMOpts = {
  max?: number;             // preferred alias
  maxTokens?: number;       // legacy alias
  temperature?: number;     // applied only if model accepts it
  response_format?: { type: "text" | "json_object" } | undefined;
};

export async function callLLM(messages: LLMMessage[], model: string, opts: LLMOpts = {}) {
  const client = getClient();
  const caps = capsFor(model);

  const max =
    (typeof opts.max === "number" ? opts.max : undefined) ??
    (typeof opts.maxTokens === "number" ? opts.maxTokens : undefined) ??
    1800;

  const temperature =
    caps.acceptsTemperature && typeof opts.temperature === "number"
      ? opts.temperature
      : undefined;

  // ---- Dispatch per family --------------------------------------------------
  let raw: any;

  if (caps.family === "gpt5") {
    // Responses API expects `input`, not `messages`
    const payload: any = {
      model,
      input: messages,                 // <-- important
      [caps.maxKey]: max,              // max_output_tokens
    };
    if (temperature !== undefined) payload.temperature = temperature;
    if (opts.response_format) payload.response_format = opts.response_format;

    raw = await client.responses.create(payload);
  } else {
    // 4o Chat Completions path
    const payload: any = {
      model,
      messages,
      [caps.maxKey]: max,              // max_tokens
    };
    if (temperature !== undefined) payload.temperature = temperature;

    raw = await client.chat.completions.create(payload);
  }

  // ---- Normalize output -----------------------------------------------------
  // Prefer unified fields if Responses returned them
  const text =
    (raw?.output_text as string) ??
    (Array.isArray(raw?.content) ? raw.content.map((c: any) => c?.text ?? c?.content ?? "").join("") : undefined) ??
    (raw?.choices?.[0]?.message?.content as string) ??
    "";

  const usage = raw?.usage
    ? {
        prompt_tokens: raw.usage.prompt_tokens ?? raw.usage.input_tokens,
        completion_tokens: raw.usage.completion_tokens ?? raw.usage.output_tokens,
        total_tokens:
          (raw.usage.prompt_tokens ?? raw.usage.input_tokens ?? 0) +
          (raw.usage.completion_tokens ?? raw.usage.output_tokens ?? 0),
      }
    : undefined;

  return {
    // normalized shape (generateStack.ts only needs these)
    text: String(text).trim(),
    model: raw?.model ?? model,
    usage,
    choices: raw?.choices ?? undefined,  // for back-compat if any code still reads it
    llmRaw: raw,
  };
}

// Helper: simple retry with jitter (optionally use in callers)
export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { return await fn(); }
    catch (err: any) {
      const code = Number(err?.status || err?.code || 0);
      if (attempt >= retries || ![408,429,500,502,503,504].includes(code)) throw err;
      await new Promise(r => setTimeout(r, (250 + Math.random()*500) * (attempt + 1)));
      attempt++;
    }
  }
}

export const getOpenAI = getClient;
export default getClient;
