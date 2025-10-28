/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// OpenAI wrapper (Responses API for gpt-5*, Chat Completions otherwise)
// - Backward-compatible call signatures:
//     callLLM(messages, model, opts)
//     callLLM(model, messages, opts)
// - Normalizes return: { model, usage, choices: [{ message: { content } }], __raw }
// - Skips invalid/unsupported params (e.g., response_format on Responses API)
// ----------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;
  maxTokens?: number;   // alias of max
  temperature?: number; // ignored for models that don't support it
  timeoutMs?: number;   // default 60_000
};

export type NormalizedLLMResponse = {
  model: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  choices: Array<{ message: { content: string } }>;
  __raw?: unknown;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----------------------------------------------------------------------------
// Capabilities
// ----------------------------------------------------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_completion_tokens" | "max_tokens";
};

export function modelCaps(model: string): Caps {
  const m = (model || "").toLowerCase();

  // All gpt-5* via Responses API
  if (m.startsWith("gpt-5")) {
    return {
      family: "responses",
      // Per your logs: temperature not supported in your current Responses API models
      acceptsTemperature: false,
      maxKey: "max_output_tokens",
    };
  }

  // Everything else → Chat Completions
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function toMaxValue(opts?: CallOpts): number | undefined {
  const v = (opts?.max ?? opts?.maxTokens);
  return typeof v === "number" ? v : undefined;
}

function toResponsesInput(messages: ChatMessage[]) {
  // Map simple messages → Responses API "input" blocks (use 'input_text')
  return messages.map((m) => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function pickTextFromResponses(raw: any): string {
  // Prefer unified output_text if present
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  const collect = (arr: any[]): string =>
    (arr || [])
      .map((seg: any) => {
        if (seg?.type === "output_text" && typeof seg?.text === "string") return seg.text;
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
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number"
      ? input + output
      : undefined);
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
// Overloads for backward-compat
// ----------------------------------------------------------------------------
export async function callLLM(
  messages: ChatMessage[],
  model: string,
  opts?: CallOpts
): Promise<NormalizedLLMResponse>;
export async function callLLM(
  model: string,
  messages: ChatMessage[],
  opts?: CallOpts
): Promise<NormalizedLLMResponse>;
export async function callLLM(
  a: string | ChatMessage[],
  b: string | ChatMessage[],
  c: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  // Normalize params so we handle both (messages, model, opts) and (model, messages, opts)
  let messages: ChatMessage[];
  let model: string;
  let opts: CallOpts = c;

  if (typeof a === "string" && Array.isArray(b)) {
    model = a;
    messages = b as ChatMessage[];
  } else if (Array.isArray(a) && typeof b === "string") {
    messages = a as ChatMessage[];
    model = b;
  } else {
    throw new Error("callLLM: invalid arguments. Use (messages, model, opts) or (model, messages, opts).");
  }

  const caps = modelCaps(model);
  const max = toMaxValue(opts);

  if (caps.family === "responses") {
    // -------------------- Responses API (gpt-5*) ----------------------------
    const body: any = {
      model,
      input: toResponsesInput(messages),
    };
    if (typeof max === "number") {
      // Your models expect max_output_tokens
      body.max_output_tokens = max;
    }
    // Only send temperature if the model accepts it (you saw 400s otherwise)
    if (caps.acceptsTemperature && typeof opts.temperature === "number") {
      body.temperature = opts.temperature;
    }

    const resp = await withTimeout(
      opts.timeoutMs ?? 60_000,
      client.responses.create(body)
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

  // -------------------- Chat Completions (non-gpt-5*) -----------------------
  // Type this request so TS overloads are satisfied
  const chatBody: OpenAI.ChatCompletionCreateParams = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(typeof max === "number" ? { max_tokens: max } : {}),
    ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
  };

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
// Back-compat alias
// ----------------------------------------------------------------------------
export async function callLLMOpenAI(
  messages: ChatMessage[] | string,
  model: string | ChatMessage[],
  opts?: CallOpts
) {
  // just forward to the overload-capable function
  // (works for both parameter orderings)
  // @ts-ignore – overload handles both signatures
  return callLLM(messages as any, model as any, opts);
}
