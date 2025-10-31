/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper that supports BOTH:
//   • GPT-5 family via Responses API (input: …)
//   • GPT-4/4o/4.1/etc via Chat Completions API (messages: …)
// Single call signature:
//   callLLM(model, messagesOrString, { maxTokens?, temperature?, timeoutMs? })
// Returns a uniform shape with .text and .modelUsed.
// ---------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;
  max?: number; // alias of maxTokens
  temperature?: number;
  timeoutMs?: number; // default 60s
};

export type LLMResult = {
  modelUsed: string;
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  // Compatibility: mirrors the classic shape some callers expect
  choices: Array<{ message: { content: string } }>;
  raw?: unknown;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Optional: if your key is scoped to a Project, this helps avoid 404s
  project: process.env.OPENAI_PROJECT || undefined,
});

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_tokens" | "max_completion_tokens";
};

function isGpt5(model: string) {
  return model.toLowerCase().startsWith("gpt-5");
}

function modelCaps(model: string): Caps {
  if (isGpt5(model)) {
    return {
      family: "responses",
      acceptsTemperature: false, // temp often ignored for 5-family
      maxKey: "max_output_tokens",
    };
  }
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

function clampMaxForModel(caps: Caps, v?: number) {
  if (typeof v !== "number") return undefined;
  let val = v;
  // GPT-5 Responses API requires >= 16
  if (caps.family === "responses" && val < 16) val = 16;
  // Reasonable hard cap safety
  if (val > 8192) val = 8192;
  return { key: caps.maxKey, value: val };
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ---------------------------------------------------------------------------
// Responses API helpers (GPT-5 family)
// ---------------------------------------------------------------------------
function toResponsesInput(msgs: ChatMessage[]) {
  // Map chat-style messages to Responses "input" format (text-only)
  return msgs.map((m) => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickTextFromResponses(raw: any): string {
  // Prefer the SDK's flattening if present
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  // Fallback: stitch together any text segments we can find
  const gather = (arr: any[]) =>
    (arr || [])
      .map((seg: any) => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");

  const a = gather(raw?.output);
  if (a) return a.trim();
  const b = gather(raw?.content);
  return (b || "").trim();
}

function usageFromResponses(raw: any) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? null;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? null;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : null);
  return { total, input, output };
}

// ---------------------------------------------------------------------------
// Chat Completions helpers (non-GPT-5)
// ---------------------------------------------------------------------------
function toChatMessages(msgs: ChatMessage[]) {
  return msgs.map((m) => ({ role: m.role, content: m.content } as const));
}

function usageFromChat(raw: any) {
  const u = raw?.usage ?? {};
  return {
    total: typeof u.total_tokens === "number" ? u.total_tokens : null,
    input: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
    output: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function callLLM(
  model: string,
  messagesOrString: ChatMessage[] | string,
  opts: CallOpts = {}
): Promise<LLMResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const msgs: ChatMessage[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const caps = modelCaps(model);
  const maxWanted = typeof opts.maxTokens === "number" ? opts.maxTokens : opts.max;
  const maxCfg = clampMaxForModel(caps, maxWanted);

  if (caps.family === "responses") {
    // GPT-5 via Responses API
    const body: any = {
      model,
      input: toResponsesInput(msgs),
    };
    if (maxCfg) body[maxCfg.key] = maxCfg.value;
    // DO NOT send 'response_format', 'modalities', or 'text.format' — they caused 400s
    // Also avoid 'temperature' here (often ignored/unsupported for 5-family)

    const resp = await withTimeout(
      opts.timeoutMs ?? 60_000,
      client.responses.create(body)
    );

    const text = pickTextFromResponses(resp);
    const usage = usageFromResponses(resp);

    return {
      modelUsed: (resp as any)?.model ?? model,
      text,
      promptTokens: usage.input,
      completionTokens: usage.output,
      totalTokens: usage.total,
      choices: [{ message: { content: text } }],
      raw: resp,
    };
  }

  // GPT-4/4o/4.1/etc via Chat Completions
  const chatBody: any = {
    model,
    messages: toChatMessages(msgs),
  };
  if (maxCfg) chatBody[maxCfg.key] = maxCfg.value;
  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
  }

  const resp = await withTimeout(
    opts.timeoutMs ?? 60_000,
    client.chat.completions.create(chatBody)
  );

  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);

  return {
    modelUsed: (resp as any)?.model ?? model,
    text,
    promptTokens: usage.input,
    completionTokens: usage.output,
    totalTokens: usage.total,
    choices: [{ message: { content: text } }],
    raw: resp,
  };
}

// Back-compat alias (some files import this name)
export const callOpenAI = callLLM;
export type { LLMResult as NormalizedLLMResponse };
