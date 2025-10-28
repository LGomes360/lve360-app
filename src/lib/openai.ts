// src/lib/openai.ts
// Model-aware OpenAI wrapper
// - gpt-5 family -> Responses API (input + max_output_tokens)
// - gpt-4o family -> Chat Completions (messages + max_tokens)
// Returns a normalized shape: { text, model, usage, choices?, llmRaw? }

type OpenAIClient = any;

let _client: OpenAIClient | null = null;

function getClient(): OpenAIClient {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY as string;
  if (!key) throw new Error("Missing OPENAI_API_KEY — set it in your env.");

  // dynamic require avoids ESM/CJS headaches during build
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require("openai");
  const OpenAI = (pkg && pkg.default) ? pkg.default : pkg;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

// ---------------------------------------------------------------------------
// Model capability map
// ---------------------------------------------------------------------------
type Caps = {
  family: "gpt5" | "gpt4o";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_tokens";
};
const MODEL_CAPS: Record<string, Caps> = {
  "gpt-5":       { family: "gpt5",  acceptsTemperature: true,  maxKey: "max_output_tokens" },
  "gpt-5-mini":  { family: "gpt5",  acceptsTemperature: false, maxKey: "max_output_tokens" },
  "gpt-4o":      { family: "gpt4o", acceptsTemperature: true,  maxKey: "max_tokens" },
  "gpt-4o-mini": { family: "gpt4o", acceptsTemperature: true,  maxKey: "max_tokens" },
};
function capsFor(model: string): Caps {
  const key = Object.keys(MODEL_CAPS).find(k => model.startsWith(k));
  // default to safe gpt-5 settings if unknown
  return key ? MODEL_CAPS[key] : { family: "gpt5", acceptsTemperature: false, maxKey: "max_output_tokens" };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type LLMMessage = { role: "system" | "user" | "assistant"; content: string | any[] };
export type LLMOpts = {
  max?: number;           // preferred alias
  maxTokens?: number;     // legacy alias
  temperature?: number;   // ignored when model doesn't accept it
  response_format?: { type: "text" | "json_object" } | undefined; // optional
};

// ---------------------------------------------------------------------------
// Normalized return: compatible with your generateStack.ts
// ---------------------------------------------------------------------------
type NormalizedUsage = {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};
type NormalizedReturn = {
  text: string;
  model?: string;
  usage?: NormalizedUsage;
  choices?: any;
  llmRaw?: any;
};

// ---------------------------------------------------------------------------
// Core call
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

  let raw: any;

  if (caps.family === "gpt5") {
    // ---------------- Responses API (gpt-5 family) ----------------
    // Use structured content for highest reliability
    const input = messages.map((m) => ({
      role: m.role,
      content: Array.isArray((m as any).content)
        ? (m as any).content
        : [{ type: "text", text: String((m as any).content ?? "") }],
    }));

    const payload: any = {
      model,
      input, // <-- Responses API uses `input`
      [caps.maxKey]: max, // max_output_tokens
      response_format: opts.response_format ?? { type: "text" },
    };
    if (temp !== undefined) payload.temperature = temp;

    raw = await client.responses.create(payload);

    // If text is suspiciously empty, retry once with flattened string input
    const primaryText =
      (raw?.output_text as string) ??
      (Array.isArray(raw?.content) ? raw.content.map((c: any) => c?.text ?? c?.content ?? "").join("") : "");

    if (!primaryText || primaryText.trim().length < 50) {
      const flat = messages
        .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
        .join("\n\n");
      raw = await client.responses.create({
        model,
        input: flat,
        [caps.maxKey]: max,
        response_format: { type: "text" },
        ...(temp !== undefined ? { temperature: temp } : {}),
      });
    }
  } else {
    // ---------------- Chat Completions (gpt-4o family) ------------
    const payload: any = {
      model,
      messages,           // chat-style messages
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
          total_tokens:
            (promptTokens ?? 0) + (completionTokens ?? 0),
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

// ---------------------------------------------------------------------------
// Optional retry helper
// ---------------------------------------------------------------------------
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

// Back-compat export names used elsewhere
export const getOpenAI = getClient;
export default getClient;
