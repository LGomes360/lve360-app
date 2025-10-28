/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper (unified):
// - Routes gpt-5* models through the Responses API (no response_format; uses input_text)
// - Routes everything else through Chat Completions
// - Normalizes shape to: { model, usage, choices[0].message.content }
// - Sends temperature only when supported
// - Adds timeout, empty-message guard, and role sanitization
// ---------------------------------------------------------------------------

import OpenAI from "openai";

// ----------------------------- Types ----------------------------------------
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;            // preferred; we remap to the correct key per API
  maxTokens?: number;      // alias of max
  temperature?: number;    // ignored for gpt-5* Responses unless caps say allowed
  timeoutMs?: number;      // default 60s
};

export type NormalizedLLMResponse = {
  model: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  choices: Array<{ message: { content: string } }>;
  __raw?: unknown; // passthrough raw response (debug/telemetry)
};

// ----------------------------- Client ---------------------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----------------------- Model Capability Table -----------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_completion_tokens" | "max_tokens";
};

export function modelCaps(model: string): Caps {
  const m = (model || "").toLowerCase();

  // gpt-5* family → Responses API
  if (m.startsWith("gpt-5")) {
    return {
      family: "responses",
      acceptsTemperature: false,           // your logs showed 400s when provided
      maxKey: "max_output_tokens",
    };
  }

  // default → Chat Completions
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

// ----------------------------- Helpers --------------------------------------
function sanitizeRole(r: ChatMessage["role"]): "system" | "user" | "assistant" {
  // Some upstreams may send tool/unknown; Responses + Chat handle s/u/a best.
  return r === "system" || r === "assistant" ? r : "user";
}

function nonEmpty(msgs: ChatMessage[]) {
  return (msgs || []).filter((m) => (m?.content ?? "").trim().length > 0);
}

function toMaxKey(caps: Caps, opts?: CallOpts) {
  const v = typeof opts?.max === "number" ? opts.max : opts?.maxTokens;
  if (typeof v !== "number") return undefined;
  return { key: caps.maxKey, value: v };
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// Build Responses API input: blocks must use { type: "input_text", text: ... }
function toResponsesInput(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: sanitizeRole(m.role),
    content: [{ type: "input_text", text: m.content }],
  }));
}

// Extract text from Responses API result despite SDK shape variations
function pickTextFromResponses(raw: any): string {
  // 1) Prefer `output_text`
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  // 2) Some SDKs present arrays under `output` or `content`
  const collect = (arr: any[]): string =>
    (arr || [])
      .map((seg: any) => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
        if (seg?.type === "output_text" && typeof seg?.text === "string") return seg.text;
        return "";
      })
      .filter(Boolean)
      .join("");

  if (Array.isArray(raw?.output)) {
    const t = collect(raw.output);
    if (t) return t.trim();
  }
  if (Array.isArray(raw?.content)) {
    const t = collect(raw.content);
    if (t) return t.trim();
  }

  // 3) Fallback: many SDKs also stuff a message-like object here
  const maybe = raw?.choices?.[0]?.message?.content;
  if (typeof maybe === "string") return maybe.trim();

  return "";
}

function normalizeUsageFromResponses(raw: any) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : undefined);

  return input || output || total
    ? { total_tokens: total, prompt_tokens: input, completion_tokens: output }
    : undefined;
}

function normalizeUsageFromChat(raw: any) {
  const u = raw?.usage;
  if (!u) return undefined;
  return {
    total_tokens: u.total_tokens,
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
  };
}

// ------------------------------- Public API ---------------------------------
export async function callLLM(
  messages: ChatMessage[],
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const safe = nonEmpty(messages).map((m) => ({ ...m, role: sanitizeRole(m.role) }));
  if (safe.length === 0) {
    throw new Error("callLLM: no non-empty messages provided");
  }

  const caps = modelCaps(model);
  const maxCfg = toMaxKey(caps, opts);

  if (caps.family === "responses") {
    // --------- Responses API (gpt-5*) ----------
    const body: Record<string, unknown> = {
      model,
      input: toResponsesInput(safe),
    };

    if (maxCfg) {
      if (maxCfg.key === "max_output_tokens") body.max_output_tokens = maxCfg.value;
      else if (maxCfg.key === "max_completion_tokens") body.max_completion_tokens = maxCfg.value;
      else body.max_tokens = maxCfg.value;
    }

    // Do NOT send temperature for gpt-5* unless explicitly allowed by caps
    if (caps.acceptsTemperature && typeof opts.temperature === "number") {
      (body as any).temperature = opts.temperature;
    }

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body as any));

    const text = pickTextFromResponses(resp) || "";
    const usage = normalizeUsageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      choices: [{ message: { content: text } }],
      __raw: resp,
    };
  }

  // --------- Chat Completions (others) ----------
  const chatBody: Record<string, unknown> = {
    model,
    messages: safe.map((m) => ({ role: m.role, content: m.content })),
  };

  if (maxCfg) {
    if (maxCfg.key === "max_tokens") chatBody.max_tokens = maxCfg.value;
    else if (maxCfg.key === "max_completion_tokens") (chatBody as any).max_completion_tokens = maxCfg.value;
    else (chatBody as any).max_output_tokens = maxCfg.value;
  }

  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    (chatBody as any).temperature = opts.temperature;
  }

  const resp = await withTimeout(
    opts.timeoutMs ?? 60_000,
    client.chat.completions.create(chatBody)
  );

  const content = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = normalizeUsageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    usage,
    choices: [{ message: { content } }],
    __raw: resp,
  };
}

// Back-compat alias (your other code sometimes imports this name)
export async function callLLMOpenAI(
  messages: ChatMessage[],
  model: string,
  opts?: CallOpts
) {
  return callLLM(messages, model, opts);
}
