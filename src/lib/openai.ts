/* eslint-disable no-console */
// -----------------------------------------------------------------------------
// OpenAI wrapper (GPT-5*: Responses API; others: Chat Completions)
// Goals:
// - Backward compatible surface: res.text; res.modelUsed; prompt/completion tokens
// - Accept BOTH call orders: callLLM(messages, model) and callLLM(model, messages)
// - Provide callChatWithRetry("mini"|"main", msgs, opts) with 5→4o fallbacks
// - Avoid fragile params (no modalities/response_format); clamp GPT-5 max tokens
// -----------------------------------------------------------------------------

import OpenAI from "openai";

// ---------- Types ----------
export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;        // alias of maxTokens
  maxTokens?: number;  // desired output tokens
  temperature?: number;
  timeoutMs?: number;  // default 60s
};

export type NormalizedLLMResponse = {
  text: string;              // normalized text content
  modelUsed: string;         // actual model returned
  promptTokens?: number | null;
  completionTokens?: number | null;
  __raw?: unknown;           // raw SDK response (for debugging)
};

// ---------- Client ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ---------- Model helpers ----------
const DEFAULT_MINI = process.env.OPENAI_MINI_MODEL?.trim() || "gpt-4o-mini";
const DEFAULT_MAIN = process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4o";

function isResponsesModel(model: string) {
  return model.toLowerCase().startsWith("gpt-5");
}

function candidatesFor(tier: "mini" | "main"): string[] {
  // Prefer GPT-5* when allowed; then 4o/4.1 fallbacks
  if (tier === "mini") {
    return [
      DEFAULT_MINI,
      // If user has a GPT-5 mini set, it may be here, else fallbacks:
      "gpt-5-mini",
      "gpt-4o-mini",
      "gpt-4.1-mini",
    ];
  }
  return [
    DEFAULT_MAIN,
    "gpt-5",
    "gpt-4o",
    "gpt-4.1",
  ];
}

function resolvedMaxTokensFor(model: string, requested?: number) {
  const want = typeof requested === "number" ? requested : undefined;
  if (!isResponsesModel(model)) {
    // Chat Completions path (4o, 4.1, etc.)
    return want;
  }
  // GPT-5 Responses API currently requires >=16; cap small tests to 16.
  const v = Math.max(16, Math.min(want ?? 512, 8192));
  return v;
}

// ---------- Common helpers ----------
function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ---------- Responses API (GPT-5*) ----------
function toResponsesInput(messages: ChatMsg[]) {
  // Convert ChatMsg[] → array of role/content blocks with input_text
  // IMPORTANT: map 'tool' -> 'assistant' to avoid role errors.
  return messages.map(m => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickTextFromResponses(raw: any): string {
  // The Responses API can return `output_text` or an `output` array with text segments.
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  const gather = (arr: any[]) =>
    (arr || [])
      .map(seg => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
        // Some SDKs return { type: 'output_text', text: '...' }
        if (seg?.type === "output_text" && typeof seg?.text === "string") return seg.text;
        return "";
      })
      .filter(Boolean)
      .join("");

  const a = gather(raw?.output);
  if (a) return a.trim();

  const b = gather(raw?.content);
  if (b) return b.trim();

  return "";
}

function usageFromResponses(raw: any) {
  // Normalize various keys the API might return
  const u = raw?.usage ?? {};
  const prompt = u.input_tokens ?? u.prompt_tokens ?? null;
  const completion = u.output_tokens ?? u.completion_tokens ?? null;
  return { promptTokens: prompt, completionTokens: completion };
}

// ---------- Chat Completions API (GPT-4o*, 4.1*) ----------
function toChatMessages(messages: ChatMsg[]) {
  // Avoid strict union by mapping "tool" to "assistant"
  return messages.map(m =>
    m.role === "tool" ? ({ role: "assistant", content: m.content } as any)
                      : ({ role: m.role, content: m.content } as any)
  );
}

function usageFromChat(raw: any) {
  const u = raw?.usage ?? {};
  return {
    promptTokens: u.prompt_tokens ?? null,
    completionTokens: u.completion_tokens ?? null,
  };
}

// ---------- Core call (single model) ----------
async function callOneModel(model: string, messages: ChatMsg[], opts: CallOpts = {}): Promise<NormalizedLLMResponse> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const want = opts.max ?? opts.maxTokens;
  const max = resolvedMaxTokensFor(model, want);

  if (isResponsesModel(model)) {
    const body: any = {
      model,
      input: toResponsesInput(messages),
      // DO NOT send 'modalities' or 'response_format'
      // Clamp output tokens for GPT-5*
      max_output_tokens: max,
    };
    // Temperature is not always supported on 5*, so only pass if defined and accepted.
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;

    const raw = await withTimeout(timeoutMs, client.responses.create(body as any));
    const text = pickTextFromResponses(raw);
    const { promptTokens, completionTokens } = usageFromResponses(raw);
    return {
      text,
      modelUsed: (raw as any)?.model ?? model,
      promptTokens,
      completionTokens,
      __raw: raw,
    };
  }

  // Chat Completions path
  const body: any = {
    model,
    messages: toChatMessages(messages),
  };
  if (typeof max === "number") body.max_tokens = max;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;

  const raw = await withTimeout(timeoutMs, client.chat.completions.create(body));
  const text = (raw?.choices?.[0]?.message?.content ?? "").trim();
  const { promptTokens, completionTokens } = usageFromChat(raw);
  return {
    text,
    modelUsed: (raw as any)?.model ?? model,
    promptTokens,
    completionTokens,
    __raw: raw,
  };
}

// ---------- Public: callLLM (accept BOTH orders) ----------
/**
 * callLLM(messages, model, opts)
 * callLLM(model, messages, opts)
 * callLLM("just a prompt", model, opts)
 */
export async function callLLM(
  a: string | ChatMsg[],
  b?: string | ChatMsg[],
  c?: CallOpts
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  let model: string;
  let messages: ChatMsg[];
  let opts: CallOpts | undefined;

  // Determine calling convention at runtime
  if (Array.isArray(a)) {
    // (messages, model, opts)
    messages = a;
    model = typeof b === "string" ? b : (process.env.OPENAI_MAIN_MODEL || DEFAULT_MAIN);
    opts = c;
  } else {
    // (model, messagesOrString, opts)
    model = a;
    const msg = Array.isArray(b)
      ? b
      : [{ role: "user", content: String(b ?? "ping") }];
    messages = msg as ChatMsg[];
    opts = c;
  }

  return callOneModel(model, messages, opts);
}

// ---------- Public: tiered retry with fallbacks ----------
export async function callChatWithRetry(
  tier: "mini" | "main",
  messages: ChatMsg[],
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  const tried: Array<{ model: string; ok: boolean; msg?: string }> = [];
  for (const model of candidatesFor(tier)) {
    try {
      const res = await callOneModel(model, messages, opts);
      if (res.text && res.text.length > 0) {
        return res;
      }
      tried.push({ model, ok: false, msg: "empty text" });
    } catch (e: any) {
      tried.push({ model, ok: false, msg: String(e?.message || e) });
      // Continue to next candidate
    }
  }
  console.error("[callChatWithRetry] all candidates failed", { tier, tried });
  throw new Error(`All ${tier} candidates failed: ${JSON.stringify(tried)}`);
}

// Convenience (legacy alias)
export const callOpenAI = callLLM;
