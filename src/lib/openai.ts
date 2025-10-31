/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// OpenAI wrapper (GPT-5 family uses Responses API; others use Chat Completions)
// Single entry: callLLM(messagesOrText, model, opts)
// ----------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;            // alias
  maxTokens?: number;      // alias
  temperature?: number;    // ignored for GPT-5 (Responses)
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
// Capability detection
// ----------------------------------------------------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_tokens" | "max_completion_tokens";
};

function modelCaps(model: string): Caps {
  const m = (model || "").toLowerCase();
  if (m.startsWith("gpt-5")) {
    return {
      family: "responses",
      acceptsTemperature: false,        // Responses: many 400s if you pass unknown keys
      maxKey: "max_output_tokens",      // canonical for Responses API
    };
  }
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

function resolvedMax(caps: Caps, opts?: CallOpts): { key: string; value: number } | undefined {
  const v = typeof opts?.max === "number" ? opts.max : opts?.maxTokens;
  if (typeof v === "number" && v > 0) {
    // Responses API rejects too-small values. Clamp to >=16 just to be safe.
    const val = Math.max(16, v);
    return { key: caps.maxKey, value: val };
  }
  // Provide a conservative default so GPT-5 actually emits output
  if (caps.family === "responses") return { key: "max_output_tokens", value: 128 };
  return undefined;
}

// ----------------------------------------------------------------------------
// Responses API helpers (GPT-5 family)
// ----------------------------------------------------------------------------
function extractSystemAndTranscript(messages: ChatMessage[]) {
  const systems = messages.filter(m => m.role === "system").map(m => m.content.trim());
  const instructions = systems.join("\n\n").trim() || undefined;

  // Build a simple text transcript for `input` (most reliable for Responses API)
  // We purposely exclude "tool" messages (map those to assistant text if needed).
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "tool" ? "assistant" : m.role;
    const text = (m.content || "").trim();
    if (!text) continue;
    lines.push(`${role.toUpperCase()}: ${text}`);
  }
  const transcript = lines.join("\n\n");
  return { instructions, transcript };
}

function pickTextFromResponses(raw: any): string {
  // 1) Fast path used by SDK: output_text (SDK synthesizes this for text-only)
  if (typeof raw?.output_text === "string") {
    return raw.output_text.trim();
  }

  // 2) Walk outputs
  const take = (arr: any[]): string =>
    (arr || [])
      .map(seg => {
        if (typeof seg?.text === "string") return seg.text;
        if (Array.isArray(seg?.content)) {
          // seg.content could be an array of {type:"output_text", text:"..."} or similar
          return seg.content.map((c: any) => c?.text || c?.content || "").filter(Boolean).join("");
        }
        if (typeof seg?.content === "string") return seg.content;
        return "";
      })
      .filter(Boolean)
      .join("");

  const a = take(raw?.output);
  if (a) return a.trim();

  const b = take(raw?.content);
  if (b) return b.trim();

  // 3) Nothing found
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
// Chat Completions helpers (non-GPT-5)
// ----------------------------------------------------------------------------
function toChatMessages(messages: ChatMessage[]) {
  // Map 'tool' to 'assistant' to avoid type/tool_call quirks
  return messages.map((m) =>
    m.role === "tool" ? ({ role: "assistant", content: m.content } as any)
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
// Timeout
// ----------------------------------------------------------------------------
function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------
export async function callLLM(
  messagesOrText: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const messages: ChatMessage[] = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: "user", content: String(messagesOrText) }];

  const caps = modelCaps(model);
  const maxCfg = resolvedMax(caps, opts);

  if (caps.family === "responses") {
    // Build instructions + single-string transcript for maximum compatibility
    const { instructions, transcript } = extractSystemAndTranscript(messages);

    const body: any = {
      model,
      input: transcript || "Respond with 'ok'.",
      // response_format helps ensure text content
      response_format: { type: "text" },
    };
    if (instructions) body.instructions = instructions;
    if (maxCfg) body[maxCfg.key] = maxCfg.value;
    // Temperature often ignored / can 400 on some versions; only pass if accepted
    // (caps.acceptsTemperature is false for Responses/GPT-5 family)

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

  // Chat Completions (gpt-4o, etc.)
  const chatBody: any = {
    model,
    messages: toChatMessages(messages),
  };
  if (maxCfg) chatBody[maxCfg.key] = maxCfg.value;
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

// Back-compat alias
export const callLLMOpenAI = callLLM;
export default callLLM;
