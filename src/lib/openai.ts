/* eslint-disable no-console */
// Unified OpenAI wrapper:
// - gpt-5* => Responses API (instructions + single-string input, max_output_tokens >= 16)
// - others => Chat Completions API (messages)

import OpenAI from "openai";

/** ANCHOR: ChatMsg */
export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;     // output-token cap; min 16 for gpt-5*
  max?: number;           // alias of maxTokens
  temperature?: number;   // ignored for gpt-5*
  timeoutMs?: number;     // default 60s
};

/** ANCHOR: NormalizedLLMResponse */
export type NormalizedLLMResponse = {
  model: string;
  modelUsed?: string;
  text: string;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  __raw?: unknown; // carry through for debugging
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isResponsesModel(m: string) {
  return m.toLowerCase().startsWith("gpt-5");
}

function pickMaxTokens(opts?: CallOpts) {
  const v = typeof opts?.maxTokens === "number" ? opts!.maxTokens : opts?.max;
  return typeof v === "number" ? v : undefined;
}

/**
 * Build a Responses-API payload that:
 *  - concatenates all non-system messages into a single string input
 *  - joins all system messages into `instructions`
 *  - enforces max_output_tokens >= 16
 */
function toResponsesPayload(model: string, messages: ChatMsg[], opts?: CallOpts) {
  const minOut = 16;
  const want = Math.max(pickMaxTokens(opts) ?? 256, minOut);

  let instructions = "";
  const parts: string[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      instructions += (instructions ? "\n" : "") + m.content;
    } else {
      parts.push(m.content);
    }
  }

  const input = parts.join("\n\n").trim();

  const body: any = {
    model,
    input: input || " ",           // avoid empty-string edge cases
    max_output_tokens: want,
  };
  if (instructions.trim()) body.instructions = instructions.trim();
  // Do not send temperature for gpt-5* (historically caused 400s)

  return body;
}

/** Robust text extractor for Responses API */
function extractResponsesText(resp: any): string {
  // 1) Preferred shortcut
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  // 2) Newer "message/content" shape: resp.output is an array
  //    Each output[i] typically has: { type: "message", role: "assistant", content: [ ... ] }
  //    Items inside content can be { type: "output_text", text: "..." } or other types.
  const out = resp?.output;
  if (Array.isArray(out)) {
    for (const block of out) {
      const content = block?.content;
      if (Array.isArray(content)) {
        // prefer explicit output_text items first
        for (const item of content) {
          if (item?.type === "output_text" && typeof item?.text === "string") {
            const t = item.text.trim();
            if (t) return t;
          }
        }
        // fallback: any item with .text
        for (const item of content) {
          if (typeof item?.text === "string") {
            const t = item.text.trim();
            if (t) return t;
          }
          if (typeof item?.content === "string") {
            const t = item.content.trim();
            if (t) return t;
          }
        }
      }
    }
  }

  // 3) Very defensive gatherer (legacy shapes)
  const gather = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(gather).join("");
    if (typeof node === "object") {
      if (typeof node.output_text === "string") return node.output_text;
      if (typeof node.text === "string") return node.text;
      if (node.content) return gather(node.content);
      if (node.output) return gather(node.output);
    }
    return "";
  };

  const a = gather(resp?.output);
  if (a.trim()) return a.trim();
  const b = gather(resp?.content);
  if (b.trim()) return b.trim();

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
  // Map 'tool' -> assistant text to satisfy SDK union
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

/** ANCHOR: callOpenAI (canonical) */
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
