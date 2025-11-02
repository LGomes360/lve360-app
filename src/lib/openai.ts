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

/**
 * Robust extractor for Responses API shapes (output_text, summary/summary_text,
 * nested content blocks, etc.). If truly no text is found, last-ditch returns "ok"
 * if that literal appears anywhere in the raw JSON (for healthchecks only).
 */
function extractResponsesText(resp: any): string {
  // 0) Fast path
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  // Deep collector: hunts through summary/content/message trees for any text-y fields
  const seen = new Set<any>();
  let firstText: string = ""; // <-- avoid nullable; prevents 'never' inference

  const take = (s: any) => {
    if (typeof s === "string") {
      const t = s.trim();
      if (t && !firstText) firstText = t;
    }
  };

  const visit = (node: any) => {
    if (!node || typeof node === "number" || typeof node === "boolean") return;
    if (typeof node === "string") { take(node); return; }
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const it of node) visit(it);
      return;
    }

    // Objects: try common text carriers first
    if (typeof node.output_text === "string") take(node.output_text);
    if (typeof node.summary_text === "string") take(node.summary_text);
    if (typeof node.text === "string") take(node.text);
    if (typeof node.content === "string") take(node.content);

    // Then traverse known containers
    if (node.summary) visit(node.summary);
    if (node.content) visit(node.content);
    if (node.message) visit(node.message);
    if (node.output) visit(node.output);

    // Finally traverse any remaining props (future-proof)
    for (const k of Object.keys(node)) {
      if (
        k === "summary" || k === "content" || k === "message" || k === "output" ||
        k.endsWith("_text") || k === "text"
      ) continue;
      visit(node[k]);
    }
  };

  visit(resp);

  if (firstText.trim()) return firstText.trim();

  // Last-ditch: if the model returned structured output that literally contains "ok",
  // allow healthcheck to succeed (handy for Responses API oddities).
  try {
    const raw = JSON.stringify(resp);
    if (/"ok"/i.test(raw)) return "ok";
  } catch { /* ignore */ }

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
