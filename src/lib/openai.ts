/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// OpenAI wrapper (routes gpt-5* → Responses API, others → Chat Completions)
// - Normalizes return shape to: { model, usage, choices[0].message.content }
// - Avoids deprecated params (no `response_format`, no `messages` for Responses)
// - Sends `temperature` only when supported
// ----------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;
  maxTokens?: number;   // alias
  temperature?: number; // ignored for models that don't support it
  timeoutMs?: number;   // default 60s
};

export type NormalizedLLMResponse = {
  model: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  choices: Array<{ message: { content: string } }>;
  // raw passthrough (for debugging/telemetry if desired)
  __raw?: unknown;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----------------------------------------------------------------------------
// Model capability table
// ----------------------------------------------------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_completion_tokens" | "max_tokens";
};

export function modelCaps(model: string): Caps {
  const m = model.toLowerCase();

  // gpt-5* use Responses API
  if (m.startsWith("gpt-5")) {
    return {
      family: "responses",
      acceptsTemperature: false, // the API has rejected temperature in your logs
      maxKey: "max_output_tokens",
    };
  }

  // default: chat completions
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function toMaxKey(caps: Caps, opts?: CallOpts) {
  const v = (opts?.max ?? opts?.maxTokens);
  if (typeof v !== "number") return undefined;
  return { key: caps.maxKey, value: v };
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function toResponsesInput(messages: ChatMessage[]) {
  // Convert simple {role, content:string} → Responses API "input" blocks
  // Use 'input_text' (not 'text') to match the errors you saw.
  return messages.map((m) => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickTextFromResponses(raw: any): string {
  // Prefer `output_text`
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  // Or aggregate any `output_text` blocks in `output` / `content`
  const collect = (arr: any[]): string => (arr || [])
    .map((seg: any) => {
      // Newer SDKs often surface: { type: "output_text", text: "..." }
      if (seg?.type === "output_text" && typeof seg?.text === "string") return seg.text;
      // Some shapes use { content: "..." }
      if (typeof seg?.content === "string") return seg.content;
      if (typeof seg?.text === "string") return seg.text;
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
  return "";
}

function normalizeUsageFromResponses(raw: any) {
  // Different SDKs label tokens differently; keep it forgiving.
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens;
  const total = raw?.usage?.total_tokens ?? (
    (typeof input === "number" && typeof output === "number") ? (input + output) : undefined
  );
  return input || output || total
    ? {
        total_tokens: total,
        prompt_tokens: input,
        completion_tokens: output,
      }
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

// ----------------------------------------------------------------------------
// Public: callLLM(messages, model, opts)
// - matches the signature your app expects elsewhere
// ----------------------------------------------------------------------------
export async function callLLM(
  messages: ChatMessage[],
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const caps = modelCaps(model);
  const maxCfg = toMaxKey(caps, opts);

  if (caps.family === "responses") {
    // ----- Responses API path (gpt-5*)
    const body: any = {
      model,
      input: toResponsesInput(messages),
    };

    if (maxCfg) {
      if (maxCfg.key === "max_output_tokens") body.max_output_tokens = maxCfg.value;
      else if (maxCfg.key === "max_completion_tokens") body.max_completion_tokens = maxCfg.value;
      else body.max_tokens = maxCfg.value;
    }

    // DO NOT send temperature when unsupported (you saw 400s for this)
    if (caps.acceptsTemperature && typeof opts.temperature === "number") {
      body.temperature = opts.temperature;
    }

    const resp = await withTimeout(
      opts.timeoutMs ?? 60_000,
      client.responses.create(body as any)
    );

    const text = pickTextFromResponses(resp) || "";
    const usage = normalizeUsageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      choices: [{ message: { content: text } }],
      __raw: resp,
    };
  }

  // ----- Chat Completions path (legacy & other models)
  const chatBody: any = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (maxCfg) {
    if (maxCfg.key === "max_tokens") chatBody.max_tokens = maxCfg.value;
    else if (maxCfg.key === "max_completion_tokens") chatBody.max_completion_tokens = maxCfg.value;
    else chatBody.max_output_tokens = maxCfg.value;
  }

  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
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

// ----------------------------------------------------------------------------
// Convenience shim your other code can call (kept for backward-compat):
// callLLM(messages, model, { max?, maxTokens?, temperature? })
// ----------------------------------------------------------------------------
export async function callLLMOpenAI(
  messages: ChatMessage[],
  model: string,
  opts?: CallOpts
) {
  return callLLM(messages, model, opts);
}
