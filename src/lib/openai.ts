/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper (model-first): callLLM(model, messages, opts)
// - Routes gpt-5*, gpt-4o* and gpt-4.1* to the Responses API
// - Routes older/legacy models to Chat Completions
// - Works with project-scoped keys; optional OPENAI_PROJECT support
// - Back-compat: also accepts callLLM(messages, model, opts)
// ---------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string };

export type CallOpts = {
  max?: number;        // alias for max tokens
  maxTokens?: number;  // alias for max tokens
  temperature?: number;
  timeoutMs?: number;  // default 60s
};

// Returned shape is intentionally flexible to match existing usage in your app.
export type NormalizedLLMResponse = {
  model: string;
  text: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens?: number | null; prompt_tokens?: number | null; completion_tokens?: number | null };
  // convenience mirrors used elsewhere in your code:
  modelUsed?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  __raw?: unknown;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Optional but recommended when your key is project-scoped:
  project: process.env.OPENAI_PROJECT, // e.g., "proj_abc123"
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isResponsesFamily(model: string) {
  const m = model.toLowerCase();
  // Treat these as Responses API families (non-realtime variants)
  if (/^gpt-5/.test(m)) return true;
  if (/^gpt-4o(?!-realtime)/.test(m)) return true;
  if (/^gpt-4\.1/.test(m)) return true;
  if (/^o[1-9]/.test(m)) return true;
  // allow forcing via env if needed
  if (process.env.OPENAI_FORCE_RESPONSES === "1") return true;
  return false;
}

type MaxKey = "max_output_tokens" | "max_tokens" | "max_completion_tokens";
function pickMaxKey(model: string): MaxKey {
  return isResponsesFamily(model) ? "max_output_tokens" : "max_tokens";
}

function toMaxValue(opts?: CallOpts): number | undefined {
  if (typeof opts?.max === "number") return opts.max;
  if (typeof opts?.maxTokens === "number") return opts.maxTokens;
  return undefined;
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ---- Responses API (for gpt-5*, gpt-4o*, gpt-4.1*, o*) --------------------
function toResponsesInput(messages: ChatMsg[] | string) {
  if (typeof messages === "string") {
    return [{ role: "user", content: [{ type: "input_text", text: messages }] }];
  }
  return messages.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickTextFromResponses(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  const fromArray = (arr: any[]) =>
    (arr || [])
      .map((seg: any) => (typeof seg?.text === "string" ? seg.text : typeof seg?.content === "string" ? seg.content : ""))
      .filter(Boolean)
      .join("");

  const a = fromArray(raw?.output);
  if (a) return a.trim();
  const b = fromArray(raw?.content);
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

// ---- Chat Completions (legacy models) --------------------------------------
function toChatMessages(messages: ChatMsg[] | string) {
  if (typeof messages === "string") return [{ role: "user", content: messages }] as any[];
  return messages.map((m) =>
    m.role === "tool" ? ({ role: "assistant", content: m.content } as any) : ({ role: m.role, content: m.content } as any)
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

// ---------------------------------------------------------------------------
// Public: callLLM(model, messages, opts)
// Also supports callLLM(messages, model, opts) for back-compat.
// ---------------------------------------------------------------------------
export async function callLLM(
  a: string | ChatMsg[] ,
  b: string | ChatMsg[] ,
  c?: CallOpts
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  // Normalize arguments to (model, messages, opts)
  let model: string;
  let messages: ChatMsg[] | string;
  let opts: CallOpts | undefined = c;

  if (typeof a === "string" && (Array.isArray(b) || typeof b === "string")) {
    model = a;
    messages = b as any;
  } else {
    // back-compat: callLLM(messages, model, opts)
    model = String(b);
    messages = a as any;
  }

  const useResponses = isResponsesFamily(model);
  const maxKey = pickMaxKey(model);
  const maxVal = toMaxValue(opts);

  if (useResponses) {
    const body: any = {
      model,
      input: toResponsesInput(messages),
    };
    if (typeof opts?.temperature === "number" && !/^gpt-5/.test(model.toLowerCase())) {
      body.temperature = opts.temperature; // some 5-series reject temperature
    }
    if (typeof maxVal === "number") {
      if (maxKey === "max_output_tokens") body.max_output_tokens = maxVal;
      else if (maxKey === "max_completion_tokens") body.max_completion_tokens = maxVal;
      else body.max_tokens = maxVal;
    }

    const resp = await withTimeout(opts?.timeoutMs ?? 60_000, client.responses.create(body));
    const text = pickTextFromResponses(resp) || "";
    const usage = normalizeUsageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      modelUsed: (resp as any)?.model ?? model,
      text,
      choices: [{ message: { content: text } }],
      usage,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      __raw: resp,
    };
  }

  // Chat Completions path
  const chatBody: any = { model, messages: toChatMessages(messages) };
  if (typeof opts?.temperature === "number") chatBody.temperature = opts.temperature;
  if (typeof maxVal === "number") {
    if (maxKey === "max_tokens") chatBody.max_tokens = maxVal;
    else if (maxKey === "max_completion_tokens") chatBody.max_completion_tokens = maxVal;
    else chatBody.max_output_tokens = maxVal;
  }

  const resp = await withTimeout(opts?.timeoutMs ?? 60_000, client.chat.completions.create(chatBody));
  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = normalizeUsageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    modelUsed: (resp as any)?.model ?? model,
    text,
    choices: [{ message: { content: text } }],
    usage,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
  };
}

// Back-compat alias
export const callLLMOpenAI = callLLM;
