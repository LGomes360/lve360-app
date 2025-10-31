/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper (single entrypoint)
//  - GPT-5 family -> Responses API with messages (reliable output)
//  - Everything else -> Chat Completions
//  - Friendly types; tolerant to SDK variations
// ---------------------------------------------------------------------------

import OpenAI from "openai";

// ----------------------------- Public types --------------------------------
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;           // alias for max tokens
  maxTokens?: number;     // alias for max tokens
  temperature?: number;   // honored only for chat-completions family
  timeoutMs?: number;     // default 60s
};

export type NormalizedLLMResponse = {
  model: string;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  choices: Array<{ message: { content: string } }>;
  __raw?: unknown;
};

// ------------------------------ Client -------------------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------ Helpers ------------------------------------
type Family = "responses" | "chat";

function familyForModel(model: string): Family {
  const m = (model || "").toLowerCase();
  // Treat all gpt-5* as Responses API
  if (m.startsWith("gpt-5")) return "responses";
  return "chat";
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ---------------------------- Usage mappers --------------------------------
function usageFromResponses(raw: any) {
  const u = raw?.usage || {};
  const input  = u.input_tokens ?? u.prompt_tokens ?? null;
  const output = u.output_tokens ?? u.completion_tokens ?? null;
  const total  = u.total_tokens ?? (typeof input === "number" && typeof output === "number"
                  ? input + output : null);
  return (input || output || total)
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

function usageFromChat(raw: any) {
  const u = raw?.usage || {};
  return (u && (u.total_tokens || u.prompt_tokens || u.completion_tokens))
    ? {
        total_tokens: u.total_tokens ?? null,
        prompt_tokens: u.prompt_tokens ?? null,
        completion_tokens: u.completion_tokens ?? null,
      }
    : undefined;
}

// --------------------------- Text extractors -------------------------------
function textFromResponses(raw: any): string {
  // Prefer unified output_text
  if (typeof raw?.output_text === "string") {
    return raw.output_text.trim();
  }
  // Fallback: scan output[].content[].text
  const out = Array.isArray(raw?.output) ? raw.output : [];
  for (const chunk of out) {
    const content = Array.isArray(chunk?.content) ? chunk.content : [];
    for (const seg of content) {
      const t = typeof seg?.text === "string" ? seg.text.trim() : "";
      if (t) return t;
    }
  }
  // Last resort: some SDKs place text at top-level content
  const content = Array.isArray(raw?.content) ? raw.content : [];
  for (const seg of content) {
    const t = typeof seg?.text === "string" ? seg.text.trim() : "";
    if (t) return t;
  }
  return "";
}

// ----------------------------- Public API ----------------------------------
/**
 * callLLM(messagesOrString, model, opts?)
 * - messagesOrString: ChatMessage[] | string
 * - model: string (e.g., "gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini", etc.)
 */
export async function callLLM(
  messagesOrString: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  // Normalize to array of messages
  const msgs: ChatMessage[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const family = familyForModel(model);
  const maxRequested = typeof opts.max === "number" ? opts.max : opts.maxTokens;
  // Enforce Responses API minimum (>=16); leave room for very small test pings.
  const maxOutput = typeof maxRequested === "number" ? clampInt(maxRequested, 16, 8192) : 256;

  if (family === "responses") {
    // --------------------------- GPT-5 family ------------------------------
    // Use messages (string content), not the older 'input' parts format.
    const body: any = {
      model,
      messages: msgs.map((m) => ({
        role: m.role === "tool" ? "assistant" : m.role,
        content: m.content,
      })),
      modalities: ["text"],
      max_output_tokens: maxOutput,
      // GPT-5 ignores temperature presently; omit to avoid 400s from strict validators.
    };

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body));
    const text = textFromResponses(resp);
    const usage = usageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      choices: [{ message: { content: text || "" } }],
      __raw: resp,
    };
  }

  // ----------------------- Chat Completions family -------------------------
  const chatBody: any = {
    model,
    messages: msgs.map((m) =>
      m.role === "tool"
        ? ({ role: "assistant", content: m.content } as any)
        : ({ role: m.role, content: m.content } as any)
    ),
    max_tokens: maxOutput, // safe for modern chat models
  };
  if (typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
  }

  const resp = await withTimeout(
    opts.timeoutMs ?? 60_000,
    client.chat.completions.create(chatBody)
  );

  const content = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    usage,
    choices: [{ message: { content } }],
    __raw: resp,
  };
}

// Back-compat alias
export const callLLMOpenAI = callLLM;
