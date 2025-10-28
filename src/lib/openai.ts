/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// OpenAI wrapper (gpt-5* => Responses API; others => Chat Completions)
// - Single entry: callLLM(messages, model, opts)
// - Soft types to avoid SDK overload/type pitfalls
// - No mid-file imports; exports are top-level only
// ----------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;            // alias
  maxTokens?: number;      // alias
  temperature?: number;    // ignored for models that don't support it
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
// Capabilities
// ----------------------------------------------------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_tokens" | "max_completion_tokens";
};

function modelCaps(model: string): Caps {
  const m = model.toLowerCase();
  if (m.startsWith("gpt-5")) {
    return {
      family: "responses",
      acceptsTemperature: false, // your logs showed 400 on temperature for gpt-5*
      maxKey: "max_output_tokens",
    };
  }
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

function toMaxKey(caps: Caps, opts?: CallOpts) {
  const v = typeof opts?.max === "number" ? opts!.max : opts?.maxTokens;
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

// ----------------------------------------------------------------------------
// Responses API helpers (gpt-5*)
// ----------------------------------------------------------------------------
function toResponsesInput(messages: ChatMessage[]) {
  // Use "input_text" (per your 400s for "text")
  return messages.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role, // map 'tool' to assistant for safety
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickTextFromResponses(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  const gather = (arr: any[]) =>
    (arr || [])
      .map((seg: any) => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
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
// Chat Completions helpers (non-gpt-5*)
// ----------------------------------------------------------------------------
function toChatMessages(messages: ChatMessage[]) {
  // Avoid strict SDK union by normalizing and casting to any:
  // - Map 'tool' -> assistant (without tool_call_id) to satisfy type
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
// Public API
// ----------------------------------------------------------------------------
export async function callLLM(
  messages: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  // Allow callLLM("prompt", "model") for convenience
  const msgs: ChatMessage[] = Array.isArray(messages)
    ? messages
    : [{ role: "user", content: String(messages) }];

  const caps = modelCaps(model);
  const maxCfg = toMaxKey(caps, opts);

  if (caps.family === "responses") {
    const body: any = {
      model,
      input: toResponsesInput(msgs),
    };
    if (maxCfg) {
      if (maxCfg.key === "max_output_tokens") body.max_output_tokens = maxCfg.value;
      else if (maxCfg.key === "max_completion_tokens") body.max_completion_tokens = maxCfg.value;
      else body.max_tokens = maxCfg.value;
    }
    if (caps.acceptsTemperature && typeof opts.temperature === "number") {
      body.temperature = opts.temperature;
    }

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

  // Chat Completions path
  const chatBody: any = {
    model,
    messages: toChatMessages(msgs),
  };
  if (maxCfg) {
    if (maxCfg.key === "max_tokens") chatBody.max_tokens = maxCfg.value;
    else if (maxCfg.key === "max_completion_tokens") chatBody.max_completion_tokens = maxCfg.value;
    else chatBody.max_output_tokens = maxCfg.value;
  }
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

// ----------------------------------------------------------------------------
// Back-compat alias
// ----------------------------------------------------------------------------
export const callLLMOpenAI = callLLM;
