/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper (single entrypoint)
//  - GPT-5 family -> Responses API with `input` (content segments)
//  - Everything else -> Chat Completions
// ---------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CallOpts = {
  max?: number;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
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

// ------------------------------ helpers ------------------------------------
type Family = "responses" | "chat";
const familyForModel = (m: string): Family => (m?.toLowerCase().startsWith("gpt-5") ? "responses" : "chat");
const clampInt = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function usageFromResponses(raw: any) {
  const u = raw?.usage || {};
  const input  = u.input_tokens ?? u.prompt_tokens ?? null;
  const output = u.output_tokens ?? u.completion_tokens ?? null;
  const total  = u.total_tokens ?? (typeof input === "number" && typeof output === "number" ? input + output : null);
  return (input || output || total) ? { total_tokens: total, prompt_tokens: input, completion_tokens: output } : undefined;
}
function usageFromChat(raw: any) {
  const u = raw?.usage || {};
  return (u && (u.total_tokens || u.prompt_tokens || u.completion_tokens))
    ? { total_tokens: u.total_tokens ?? null, prompt_tokens: u.prompt_tokens ?? null, completion_tokens: u.completion_tokens ?? null }
    : undefined;
}
function textFromResponses(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text.trim();
  const out = Array.isArray(raw?.output) ? raw.output : [];
  for (const chunk of out) {
    const content = Array.isArray(chunk?.content) ? chunk.content : [];
    for (const seg of content) {
      const t = typeof seg?.text === "string" ? seg.text.trim() : "";
      if (t) return t;
    }
  }
  const content = Array.isArray(raw?.content) ? raw.content : [];
  for (const seg of content) {
    const t = typeof seg?.text === "string" ? seg.text.trim() : "";
    if (t) return t;
  }
  return "";
}

// ----------------------------- public API ----------------------------------
export async function callLLM(
  messagesOrString: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const msgs: ChatMessage[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const family = familyForModel(model);
  const requested = typeof opts.max === "number" ? opts.max : opts.maxTokens;
  const maxOutput = typeof requested === "number" ? clampInt(requested, 16, 8192) : 256;

  if (family === "responses") {
    // GPT-5 / GPT-5-mini use Responses API with `input` (NOT `messages`)
    const input = msgs.map((m) => ({
      role: m.role === "tool" ? "assistant" : m.role,
      content: [{ type: "input_text", text: m.content }],
    }));

    const body: any = {
      model,
      input,
      modalities: ["text"],
      max_output_tokens: maxOutput, // must be >= 16
      // omit temperature for GPT-5 to avoid 400s from strict validators
    };

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body));
    const text = textFromResponses(resp);
    const usage = usageFromResponses(resp);

    return {
      model: (resp as any)?.model ?? model,
      usage,
      choices: [{ message: { content: text || "" } }],
      __raw: resp,
    };
  }

  // Everything else -> Chat Completions
  const chatBody: any = {
    model,
    messages: msgs.map((m) =>
      m.role === "tool"
        ? ({ role: "assistant", content: m.content } as any)
        : ({ role: m.role, content: m.content } as any)
    ),
    max_tokens: maxOutput,
  };
  if (typeof opts.temperature === "number") chatBody.temperature = opts.temperature;

  const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.chat.completions.create(chatBody));
  const content = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);

  return {
    model: (resp as any)?.model ?? model,
    usage,
    choices: [{ message: { content } }],
    __raw: resp,
  };
}

export const callLLMOpenAI = callLLM;
