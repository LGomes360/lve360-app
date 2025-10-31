/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper with dual-path routing:
// - GPT-5 family -> Responses API (uses `instructions`, `input`, `text.format`)
// - Everything else -> Chat Completions API
//
// Public surface (back-compat):
//   callLLM(messagesOrString, model, { maxTokens, temperature, timeoutMs })
//
// Returned shape (back-compat):
//   { model, usage: { prompt_tokens, completion_tokens, total_tokens }, choices: [{ message: { content } }], __raw? }
// ---------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;       // alias of maxTokens
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number; // default 60s
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

// ------------------------------- Capabilities -------------------------------
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
      acceptsTemperature: false, // 5.x often ignores or rejects temperature
      maxKey: "max_output_tokens",
    };
  }
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

function pickMax(caps: Caps, opts?: CallOpts) {
  const v = typeof opts?.max === "number" ? opts.max : opts?.maxTokens;
  if (typeof v !== "number" || v <= 0) return undefined;
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

// ------------------------- Helpers: message handling ------------------------
function normalizeMessages(input: ChatMessage[] | string): ChatMessage[] {
  if (Array.isArray(input)) return input;
  return [{ role: "user", content: String(input) }];
}

function splitForResponses(messages: ChatMessage[]) {
  // Responses API expects:
  //  - `instructions`: string (system/meta guidance)
  //  - `input`: string or array of content blocks (we use a single string)
  //
  // We concat ALL system messages into `instructions` and EVERYTHING ELSE
  // (user+assistant+tool) into a single plain-text `input`.
  const sys: string[] = [];
  const rest: string[] = [];
  for (const m of messages) {
    if (m.role === "system") sys.push(m.content);
    else rest.push(m.content);
  }
  const instructions = sys.join("\n\n").trim() || undefined;
  const input = rest.join("\n\n").trim(); // must be non-empty for output
  return { instructions, input };
}

function usageFromResponses(raw: any) {
  const u = raw?.usage || {};
  const inTok = u.input_tokens ?? u.prompt_tokens ?? null;
  const outTok = u.output_tokens ?? u.completion_tokens ?? null;
  const total = u.total_tokens ?? (typeof inTok === "number" && typeof outTok === "number" ? inTok + outTok : null);
  return (inTok ?? outTok ?? total) != null
    ? { total_tokens: total, prompt_tokens: inTok, completion_tokens: outTok }
    : undefined;
}

function textFromResponses(raw: any): string {
  // Primary fast path
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  // Fallbacks: some SDKs expose segments differently
  const collect = (arr: any[]) =>
    (arr || [])
      .map((seg: any) => {
        if (typeof seg?.text === "string") return seg.text;
        if (typeof seg?.content === "string") return seg.content;
        return "";
      })
      .filter(Boolean)
      .join("");

  const a = collect(raw?.output);
  if (a) return a.trim();
  const b = collect(raw?.content);
  if (b) return b.trim();
  return "";
}

function toChatMessages(messages: ChatMessage[]) {
  // Loosen role types for SDK union (map 'tool' to 'assistant')
  return messages.map((m) =>
    m.role === "tool" ? ({ role: "assistant", content: m.content } as any)
                      : ({ role: m.role, content: m.content } as any)
  );
}

function usageFromChat(raw: any) {
  const u = raw?.usage;
  return u
    ? {
        total_tokens: u.total_tokens ?? null,
        prompt_tokens: u.prompt_tokens ?? null,
        completion_tokens: u.completion_tokens ?? null,
      }
    : undefined;
}

// --------------------------------- Public ----------------------------------
export async function callLLM(
  messagesOrString: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const caps = modelCaps(model);
  const maxCfg = pickMax(caps, opts);
  const msgs = normalizeMessages(messagesOrString);

  if (caps.family === "responses") {
    const { instructions, input } = splitForResponses(msgs);

    const body: any = {
      model,
      input, // string; ensures the model actually generates an output
      // Required in recent GPT-5 APIs if you want plain text back:
      text: { format: { type: "text" } },
    };
    if (instructions) body.instructions = instructions;
    if (maxCfg?.key === "max_output_tokens") body.max_output_tokens = maxCfg.value;
    if (maxCfg?.key === "max_completion_tokens") body.max_completion_tokens = maxCfg.value;
    if (maxCfg?.key === "max_tokens") body.max_tokens = maxCfg.value;
    // Many GPT-5 deployments ignore/forbid temperature; we gate on capability
    if (caps.acceptsTemperature && typeof opts.temperature === "number") {
      body.temperature = opts.temperature;
    }

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body));
    const content = textFromResponses(resp);
    const usage = usageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      choices: [{ message: { content } }],
      __raw: resp,
    };
  }

  // Chat Completions path
  const chatBody: any = {
    model,
    messages: toChatMessages(msgs),
  };
  if (maxCfg?.key === "max_tokens") chatBody.max_tokens = maxCfg.value;
  if (maxCfg?.key === "max_completion_tokens") chatBody.max_completion_tokens = maxCfg.value;
  if (maxCfg?.key === "max_output_tokens") chatBody.max_output_tokens = maxCfg.value;
  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
  }

  const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.chat.completions.create(chatBody));
  const content = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    usage,
    choices: [{ message: { content } }],
  };
}

// Back-compat alias
export const callLLMOpenAI = callLLM;
