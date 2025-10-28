// src/lib/openai.ts
// Model-aware OpenAI wrapper
// - gpt-5 family -> Responses API (input + max_output_tokens + text.format)
// - gpt-4o family -> Chat Completions (messages + max_tokens)

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

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------
type Caps = { family: "gpt5" | "gpt4o"; acceptsTemperature: boolean; maxKey: "max_output_tokens" | "max_tokens" };
const MODEL_CAPS: Record<string, Caps> = {
  "gpt-5":       { family: "gpt5",  acceptsTemperature: true,  maxKey: "max_output_tokens" },
  "gpt-5-mini":  { family: "gpt5",  acceptsTemperature: false, maxKey: "max_output_tokens" },
  "gpt-4o":      { family: "gpt4o", acceptsTemperature: true,  maxKey: "max_tokens" },
  "gpt-4o-mini": { family: "gpt4o", acceptsTemperature: true,  maxKey: "max_tokens" },
};
function capsFor(model: string): Caps {
  const key = Object.keys(MODEL_CAPS).find(k => model.startsWith(k));
  return key ? MODEL_CAPS[key] : { family: "gpt5", acceptsTemperature: false, maxKey: "max_output_tokens" };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type LLMMessage = { role: "system" | "user" | "assistant"; content: string | any[] };
export type LLMOpts = {
  max?: number;
  maxTokens?: number;   // legacy alias
  temperature?: number;
  response_format?: { type: "text" | "json_object" } | undefined; // mapped to text.format
};
type NormalizedUsage = { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
type NormalizedReturn = { text: string; model?: string; usage?: NormalizedUsage; choices?: any; llmRaw?: any };

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
export async function callLLM(
  messages: LLMMessage[],
  model: string,
  opts: LLMOpts = {}
): Promise<NormalizedReturn> {
  const client = getClient();
  const caps = capsFor(model);

  const max =
    (typeof opts.max === "number" ? opts.max : undefined) ??
    (typeof opts.maxTokens === "number" ? opts.maxTokens : undefined) ??
    1800;

  const temp =
    caps.acceptsTemperature && typeof opts.temperature === "number"
      ? opts.temperature
      : undefined;

  // Map legacy response_format -> Responses API text.format
  const textFormat =
    opts.response_format?.type === "json_object" ? "json" : "text";

  let raw: any;

  if (caps.family === "gpt5") {
    // ---------------- Responses API ----------------
    // IMPORTANT: content[].type must be "input_text"
    const input = messages.map((m) => ({
      role: m.role,
      content: Array.isArray((m as any).content)
        ? (m as any).content
        : [{ type: "input_text", text: String((m as any).content ?? "") }],
    }));

    const payload: any = {
      model,
      input, // <- Responses API
      [caps.maxKey]: max, // max_output_tokens
      text: { format: textFormat }, // "text" | "json"
    };
    if (temp !== undefined) payload.temperature = temp;

    raw = await client.responses.create(payload);

    // If too short/empty, retry once with flattened text input
    const primaryText =
      (raw?.output_text as string) ??
      (Array.isArray(raw?.content) ? raw.content.map((c: any) => c?.text ?? c?.content ?? "").join("") : "");

    if (!primaryText || primaryText.trim().length < 50) {
      const flat = messages
        .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
        .join("\n\n");

      raw = await client.responses.create({
        model,
        input: [{ role: "user", content: [{ type: "input_text", text: flat }] }],
        [caps.maxKey]: max,
        text: { format: textFormat },
        ...(temp !== undefined ? { temperature: temp } : {}),
      });
    }
  } else {
    // ---------------- Chat Completions (4o) ----------------
    const payload: any = {
      model,
      messages,
      [caps.maxKey]: max, // max_tokens
    };
    if (temp !== undefined) payload.temperature = temp;
    raw = await client.chat.completions.create(payload);
  }

  // ---------------- Normalize output ----------------
  const text =
    (raw?.output_text as string) ??
    (Array.isArray(raw?.content) ? raw.content.map((c: any) => c?.text ?? c?.content ?? "").join("") : undefined) ??
    (raw?.choices?.[0]?.message?.content as string) ??
    "";

  const promptTokens = raw?.usage?.prompt_tokens ?? raw?.usage?.input_tokens;
  const completionTokens = raw?.usage?.completion_tokens ?? raw?.usage?.output_tokens;

  const usage: NormalizedUsage | undefined =
    promptTokens != null || completionTokens != null
      ? {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: (promptTokens ?? 0) + (completionTokens ?? 0),
        }
      : undefined;

  return {
    text: String(text ?? "").trim(),
    model: raw?.model ?? model,
    usage,
    choices: raw?.choices ?? undefined,
    llmRaw: raw,
  };
}

// Optional retry helper
export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const code = Number(err?.status || err?.code || 0);
      if (attempt >= retries || ![408, 429, 500, 502, 503, 504].includes(code)) throw err;
      await new Promise((r) => setTimeout(r, (250 + Math.random() * 500) * (attempt + 1)));
      attempt++;
    }
  }
}

export const getOpenAI = getClient;
export default getClient;
