/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// OpenAI wrapper
//  - GPT-5 family -> Responses API with role/content "input" blocks
//  - Others (e.g., gpt-4o) -> Chat Completions
//  - Single entry: callLLM(messagesOrText, model, opts)
// ----------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;            // alias for maxTokens
  maxTokens?: number;      // alias for max
  temperature?: number;    // ignored for GPT-5 responses
  timeoutMs?: number;      // default 60s
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

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ----------------------------------------------------------------------------
// Capability detection
// ----------------------------------------------------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_tokens" | "max_completion_tokens";
};

function modelCaps(model: string): Caps {
  const m = (model || "").toLowerCase();
  if (m.startsWith("gpt-5")) {
    return {
      family: "responses",
      acceptsTemperature: false,
      maxKey: "max_output_tokens",
    };
  }
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

function resolvedMax(caps: Caps, opts?: CallOpts): { key: string; value: number } | undefined {
  const v = typeof opts?.max === "number" ? opts.max : opts?.maxTokens;
  if (typeof v === "number" && v > 0) {
    return { key: caps.maxKey, value: Math.max(16, v) };
  }
  // Default to a safe value so GPT-5 actually emits text
  if (caps.family === "responses") return { key: "max_output_tokens", value: 128 };
  return undefined;
}

// ----------------------------------------------------------------------------
// Responses API helpers (GPT-5 family)
// ----------------------------------------------------------------------------
function toResponsesInput(messages: ChatMessage[]) {
  // Build strict role/content "input" blocks. This is the format GPT-5 expects.
  return messages.map((m) => {
    const role = m.role === "tool" ? "assistant" : m.role; // map tool -> assistant
    const text = (m.content || "").trim();
    return {
      role,
      content: [{ type: "input_text", text }],
    };
  });
}

function pickTextFromResponses(raw: any): string {
  // SDK often synthesizes output_text for pure-text responses
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  // Walk output/message content arrays
  const collect = (arr: any[]): string =>
    (arr || [])
      .map((seg: any) => {
        // seg.content may be an array of {type:"output_text", text:"..."}
        if (typeof seg?.text === "string") return seg.text;
        if (Array.isArray(seg?.content)) {
          return seg.content
            .map((c: any) => (typeof c?.text === "string" ? c.text : (typeof c?.content === "string" ? c.content : "")))
            .filter(Boolean)
            .join("");
        }
        if (typeof seg?.content === "string") return seg.content;
        return "";
      })
      .filter(Boolean)
      .join("");

  const a = collect(raw?.output);
  if (a) return a.trim();
  const b = collect(raw?.content);
  if (b) return b.trim();
  return "";
}

function normalizeUsageFromResponses(raw: any) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? null;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? null;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : null);
  return input || output || total
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

// ----------------------------------------------------------------------------
// Chat Completions helpers (non-GPT-5)
// ----------------------------------------------------------------------------
function toChatMessages(messages: ChatMessage[]) {
  return messages.map((m) =>
    m.role === "tool"
      ? ({ role: "assistant", content: m.content } as any)
      : ({ role: m.role, content: m.content } as any)
  );
}

function normalizeUsageFromChat(raw: any) {
  const u = raw?.usage;
  if (!u) return undefined;
  return {
    total_tokens: u.total_tokens ?? null,
    prompt_tokens: u.prompt_tokens ?? null,
    completion_tokens: u.completion_tokens ?? null,
  };
}

// ----------------------------------------------------------------------------
// Timeout
// ----------------------------------------------------------------------------
function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------
export async function callLLM(
  messagesOrText: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const messages: ChatMessage[] = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: "user", content: String(messagesOrText) }];

  const caps = modelCaps(model);
  const maxCfg = resolvedMax(caps, opts);

  if (caps.family === "responses") {
    // Build role/content input blocks ONLY (no 'messages', no 'modalities')
    const body: any = {
      model,
      input: toResponsesInput(messages),
      response_format: { type: "text" }, // keep text-only output
    };
    if (maxCfg) body[maxCfg.key] = maxCfg.value;

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body));
    const text = pickTextFromResponses(resp) || "";
    const usage = normalizeUsageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      choices: [{ message: { content: text } }],
      __raw: resp,
    };
  }

  // Chat Completions path (gpt-4o, etc.)
  const chatBody: any = {
    model,
    messages: toChatMessages(messages),
  };
  if (maxCfg) chatBody[maxCfg.key] = maxCfg.value;
  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
  }

  const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.chat.completions.create(chatBody));
  const content = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = normalizeUsageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    usage,
    choices: [{ message: { content } }],
  };
}

export const callLLMOpenAI = callLLM;
export default callLLM;
