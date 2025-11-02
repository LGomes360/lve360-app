/* eslint-disable no-console */
// Unified OpenAI wrapper:
// - gpt-5* => Responses API (instructions + input_text, max_output_tokens >= 16)
// - others => Chat Completions API (messages)
// Returns a normalized shape consumed by models.ts and generateStack.ts

import OpenAI from "openai";

export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;     // alias for output tokens (min 16 on gpt-5*)
  max?: number;           // alias; same meaning as maxTokens
  temperature?: number;   // ignored for gpt-5*
  timeoutMs?: number;     // default 60s
};

export type NormalizedLLMResponse = {
  model: string;
  modelUsed?: string;
  text: string;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  __raw?: unknown;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isResponsesModel(m: string) {
  return m.toLowerCase().startsWith("gpt-5");
}

function pickMaxTokens(opts?: CallOpts) {
  const v = typeof opts?.maxTokens === "number" ? opts!.maxTokens : opts?.max;
  return typeof v === "number" ? v : undefined;
}

// Responses API expects:
// - `instructions` (string) for any system content
// - `input` (string OR array of content blocks). We’ll send an array of messages
// - `max_output_tokens` (must be >= 16)
function toResponsesPayload(model: string, messages: ChatMsg[], opts?: CallOpts) {
  const minOut = 16;
  const want = Math.max(pickMaxTokens(opts) ?? 256, minOut);

  let instructions = "";
  const inputBlocks: Array<{
    role: "user" | "assistant";
    content: Array<{ type: "input_text"; text: string }>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      instructions += (instructions ? "\n" : "") + m.content;
    } else {
      const role = m.role === "assistant" ? "assistant" : "user";
      inputBlocks.push({
        role,
        content: [{ type: "input_text", text: m.content }],
      });
    }
  }

  const body: any = {
    model,
    input: inputBlocks.length ? inputBlocks : [{ role: "user", content: [{ type: "input_text", text: "" }]}],
    max_output_tokens: want,
  };

  if (instructions.trim()) body.instructions = instructions.trim();
  // No temperature on gpt-5* (caused 400s in our history)

  return body;
}

// Extract text from Responses API result robustly
function extractResponsesText(resp: any): string {
  if (typeof resp?.output_text === "string") return resp.output_text.trim();

  // Newer SDKs: resp.output is an array of content blocks
  const gather = (obj: any): string => {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map(gather).join("");
    if (typeof obj === "object") {
      // try common shapes
      if (typeof obj.text === "string") return obj.text;
      if (obj.content) return gather(obj.content);
      if (obj.output_text) return String(obj.output_text);
    }
    return "";
  };

  const a = gather(resp?.output);
  if (a) return a.trim();
  const b = gather(resp?.content);
  if (b) return b.trim();
  return "";
}

function usageFromResponses(resp: any) {
  const u = resp?.usage || {};
  const input = u.input_tokens ?? u.prompt_tokens ?? null;
  const output = u.output_tokens ?? u.completion_tokens ?? null;
  const total = u.total_tokens ?? (input != null && output != null ? input + output : null);
  return input != null || output != null || total != null
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

function toChatMessages(messages: ChatMsg[]) {
  // Map 'tool' -> 'assistant' (string content) to satisfy SDK union
  return messages.map((m) =>
    m.role === "tool"
      ? ({ role: "assistant", content: m.content } as any)
      : ({ role: m.role, content: m.content } as any)
  );
}

function usageFromChat(resp: any) {
  const u = resp?.usage;
  if (!u) return undefined;
  return {
    total_tokens: u.total_tokens ?? null,
    prompt_tokens: u.prompt_tokens ?? null,
    completion_tokens: u.completion_tokens ?? null,
  };
}

// Export ONE canonical wrapper used everywhere else.
// Signature matches your call sites: callOpenAI(model, messagesOrString, opts)
export async function callOpenAI(
  model: string,
  messagesOrString: ChatMsg[] | string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const messages: ChatMsg[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const timeoutMs = opts.timeoutMs ?? 60_000;

  if (isResponsesModel(model)) {
    const body = toResponsesPayload(model, messages, opts);
    const resp = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`OpenAI Responses timeout after ${timeoutMs} ms`)), timeoutMs);
      client.responses.create(body).then((r) => { clearTimeout(t); resolve(r); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });

    const text = extractResponsesText(resp);
    return {
      model: (resp as any)?.model ?? model,
      modelUsed: (resp as any)?.model ?? model,
      text,
      usage: usageFromResponses(resp),
      __raw: resp,
    };
  }

  // Chat Completions path (GPT-4 family, etc.)
  const chatBody: any = {
    model,
    messages: toChatMessages(messages),
  };
  const maxT = pickMaxTokens(opts);
  if (typeof maxT === "number") chatBody.max_tokens = maxT;
  if (typeof opts.temperature === "number") chatBody.temperature = opts.temperature;

  const resp = await new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI Chat timeout after ${timeoutMs} ms`)), timeoutMs);
    client.chat.completions.create(chatBody).then((r) => { clearTimeout(t); resolve(r); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });

  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  return {
    model: (resp as any)?.model ?? model,
    modelUsed: (resp as any)?.model ?? model,
    text,
    usage: usageFromChat(resp),
    __raw: resp,
  };
}
// --- Back-compat type shim ---------------------------------------------------
export type LLMResult = NormalizedLLMResponse;
