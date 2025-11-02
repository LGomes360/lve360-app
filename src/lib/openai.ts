/* eslint-disable no-console */
// Unified OpenAI wrapper
// - gpt-5* => Responses API (input_text; no response_format/modalities)
// - others  => Chat Completions API
// Signature kept compatible with your code: callOpenAI(model, messagesOrString, opts)

import OpenAI from "openai";

export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;   // alias you’ve been using
  max?: number;         // accepted too
  temperature?: number; // respected only for chat-completions family
  timeoutMs?: number;   // default 60s
};

export type NormalizedLLMResponse = {
  modelUsed: string;
  text: string;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  // Back-compat for any legacy call sites that looked at choices[0].message.content
  choices?: Array<{ message: { content: string } }>;
  raw?: unknown;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isGpt5Family(model: string) {
  return model.toLowerCase().startsWith("gpt-5");
}

function toMaxRequested(opts?: CallOpts): number | undefined {
  if (!opts) return undefined;
  if (typeof opts.maxTokens === "number") return opts.maxTokens;
  if (typeof opts.max === "number") return opts.max;
  return undefined;
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function toResponsesInput(messages: ChatMsg[]) {
  // Responses API expects "input" not "messages", with typed segments.
  return messages.map(m => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickResponsesText(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  const pull = (arr: any[]) =>
    (arr || [])
      .map((seg: any) => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
        return "";
      })
      .filter(Boolean)
      .join("");

  const a = pull(raw?.output);
  if (a) return a.trim();
  const b = pull(raw?.content);
  return (b || "").trim();
}

function normalizeResponsesUsage(raw: any) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? null;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? null;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : null);
  return input || output || total
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

function toChatMessages(messages: ChatMsg[]) {
  // Map 'tool' -> 'assistant' to satisfy union
  return messages.map(m =>
    m.role === "tool"
      ? ({ role: "assistant", content: m.content } as any)
      : ({ role: m.role, content: m.content } as any)
  );
}

function normalizeChatUsage(raw: any) {
  const u = raw?.usage;
  if (!u) return undefined;
  return {
    total_tokens: u.total_tokens ?? null,
    prompt_tokens: u.prompt_tokens ?? null,
    completion_tokens: u.completion_tokens ?? null,
  };
}

/**
 * Main entry used across the app.
 * Accepts either ChatMsg[] or a plain string. You currently call it as:
 *   callOpenAI("model", messages, { maxTokens, timeoutMs })
 */
export async function callOpenAI(
  model: string,
  messagesOrString: ChatMsg[] | string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  // Normalize input → ChatMsg[]
  const msgs: ChatMsg[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const maxRequested = toMaxRequested(opts);
  const timeout = opts.timeoutMs ?? 60_000;

  if (isGpt5Family(model)) {
    // Responses API path
    const body: any = {
      model,
      input: toResponsesInput(msgs),
      // token control: Responses API requires >=16; default to 256 if not given
      max_output_tokens: Math.max(16, maxRequested ?? 256),
      // DO NOT send response_format or modalities (cause 400s)
      // Temperature is generally ignored for reasoning models
    };

    const resp = await withTimeout(timeout, client.responses.create(body));
    const text = pickResponsesText(resp) || "";
    const usage = normalizeResponsesUsage(resp);

    return {
      modelUsed: (resp as any)?.model ?? model,
      text,
      usage,
      choices: [{ message: { content: text } }],
      raw: resp,
    };
  }

  // Chat Completions path
  const chatBody: any = {
    model,
    messages: toChatMessages(msgs),
    max_tokens: maxRequested ?? 512,
  };
  if (typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
  }

  const resp = await withTimeout(timeout, client.chat.completions.create(chatBody));
  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = normalizeChatUsage(resp);

  return {
    modelUsed: (resp as any)?.model ?? model,
    text,
    usage,
    choices: [{ message: { content: text } }],
    raw: resp,
  };
}
// --- Back-compat shims ------------------------------------------------------
export type LLMResult = NormalizedLLMResponse;


