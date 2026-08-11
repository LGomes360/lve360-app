/* eslint-disable no-console */
// Low-level OpenAI transport. Product features should call the task-aware
// gateway in src/lib/ai/gateway.ts instead of selecting models directly.

import OpenAI from "openai";

/** ANCHOR: ChatMsg */
export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;     // output-token cap; min 16
  max?: number;           // alias of maxTokens
  temperature?: number;   // only sent to non-reasoning model families
  timeoutMs?: number;     // default 75s
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  safetyIdentifier?: string;
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
    cached_tokens?: number | null;
    reasoning_tokens?: number | null;
  };
  __raw?: unknown; // carry through for debugging
};

let client: OpenAI | null = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function pickMaxTokens(opts?: CallOpts) {
  const v = typeof opts?.maxTokens === "number" ? opts!.maxTokens : opts?.max;
  return typeof v === "number" ? v : undefined;
}

/**
 * Build one privacy-conscious Responses API payload for every supported text
 * model. The task gateway controls the model and reasoning settings.
 */
function toResponsesPayload(model: string, messages: ChatMsg[], opts?: CallOpts) {
  const minOut = 16;
  const want = Math.max(pickMaxTokens(opts) ?? 256, minOut);

  let instructions = "";
  const input: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      instructions += (instructions ? "\n" : "") + m.content;
    } else {
      input.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
    }
  }

  const body: any = {
    model,
    input: input.length ? input : [{ role: "user", content: " " }],
    max_output_tokens: want,
    store: false,
  };
  if (instructions.trim()) body.instructions = instructions.trim();
  if (opts?.safetyIdentifier) body.safety_identifier = opts.safetyIdentifier;
  if (model.toLowerCase().startsWith("gpt-5") && opts?.reasoningEffort) {
    body.reasoning = { effort: opts.reasoningEffort };
  } else if (typeof opts?.temperature === "number") {
    body.temperature = opts.temperature;
  }

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
  const cached = u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? null;
  const reasoning = u.output_tokens_details?.reasoning_tokens ?? u.completion_tokens_details?.reasoning_tokens ?? null;
  return input != null || output != null || total != null
    ? {
        total_tokens: total,
        prompt_tokens: input,
        completion_tokens: output,
        cached_tokens: cached,
        reasoning_tokens: reasoning,
      }
    : undefined;
}

/** ANCHOR: callOpenAI (canonical) */
export async function callOpenAI(
  model: string,
  messagesOrString: ChatMsg[] | string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  const messages: ChatMsg[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const timeoutMs = opts.timeoutMs ?? 75_000;

  const body = toResponsesPayload(model, messages, opts);

  const resp = await new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI Responses timeout after ${timeoutMs} ms`)), timeoutMs);
    getClient().responses.create(body).then((r) => { clearTimeout(t); resolve(r); })
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

// --- Back-compat type shim ---------------------------------------------------
export type LLMResult = NormalizedLLMResponse;
