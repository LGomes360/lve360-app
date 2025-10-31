/* eslint-disable no-console */
// ----------------------------------------------------------------------------
// OpenAI wrapper: GPT-5 family via Responses API, others via Chat Completions.
// Single entry: callLLM(messagesOrString, model, opts)
// ----------------------------------------------------------------------------
import OpenAI from "openai";

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };
export type CallOpts = { max?: number; maxTokens?: number; temperature?: number; timeoutMs?: number };
export type NormalizedLLMResponse = {
  model: string;
  usage?: { total_tokens?: number | null; prompt_tokens?: number | null; completion_tokens?: number | null };
  choices: Array<{ message: { content: string } }>;
  __raw?: unknown;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- capability detection ---------------------------------------------------
type Caps = { family: "responses" | "chat"; acceptsTemperature: boolean; maxKey: "max_output_tokens" | "max_tokens" };
function modelCaps(model: string): Caps {
  const m = (model || "").toLowerCase();
  if (m.startsWith("gpt-5")) {
    return { family: "responses", acceptsTemperature: false, maxKey: "max_output_tokens" };
  }
  return { family: "chat", acceptsTemperature: true, maxKey: "max_tokens" };
}
function toMaxValue(opts?: CallOpts) {
  return typeof opts?.max === "number" ? opts.max : typeof opts?.maxTokens === "number" ? opts.maxTokens : undefined;
}
function withTimeout<T>(ms: number | undefined, p: Promise<T>) {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
  });
}

// ---- Responses API (GPT-5*) helpers ----------------------------------------
function toResponsesInput(msgs: ChatMessage[]) {
  // Use simple { role, content } with STRING content (no "input_text" parts)
  return msgs.map(m => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: m.content,
  }));
}
function pickTextFromResponses(raw: any): string {
  // Prefer output_text; otherwise read first text segment in output[]
  if (typeof raw?.output_text === "string") return raw.output_text.trim();
  const out = Array.isArray(raw?.output) ? raw.output : [];
  for (const chunk of out) {
    const c = Array.isArray(chunk?.content) ? chunk.content : [];
    for (const seg of c) {
      if (typeof seg?.text === "string" && seg.text.trim()) return seg.text.trim();
      if (typeof seg?.content === "string" && seg.content.trim()) return seg.content.trim();
    }
  }
  return "";
}
function usageFromResponses(raw: any) {
  const i = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? null;
  const o = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? null;
  const t = raw?.usage?.total_tokens ?? (typeof i === "number" && typeof o === "number" ? i + o : null);
  return i || o || t ? { total_tokens: t, prompt_tokens: i, completion_tokens: o } : undefined;
}

// ---- Chat Completions helpers ----------------------------------------------
function toChatMessages(msgs: ChatMessage[]) {
  return msgs.map(m => (m.role === "tool" ? ({ role: "assistant", content: m.content } as any) : ({ role: m.role, content: m.content } as any)));
}
function usageFromChat(raw: any) {
  const u = raw?.usage;
  return u ? { total_tokens: u.total_tokens ?? null, prompt_tokens: u.prompt_tokens ?? null, completion_tokens: u.completion_tokens ?? null } : undefined;
}

// ---- Public API -------------------------------------------------------------
export async function callLLM(
  messagesOrString: ChatMessage[] | string,
  model: string,
  opts: CallOpts = {}
): Promise<NormalizedLLMResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const msgs: ChatMessage[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const caps = modelCaps(model);
  const maxVal = Math.max(16, toMaxValue(opts) ?? 256); // Responses API requires >=16

  if (caps.family === "responses") {
    const body: any = {
      model,
      input: toResponsesInput(msgs),  // <- correct format
      max_output_tokens: maxVal,
    };
    // temperature ignored for GPT-5

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body));
    const text = pickTextFromResponses(resp) || "";
    const usage = usageFromResponses(resp);
    return { model: (resp as any)?.model ?? model, usage, choices: [{ message: { content: text } }], __raw: resp };
  }

  // non-GPT-5 → Chat Completions
  const chatBody: any = { model, messages: toChatMessages(msgs), max_tokens: maxVal };
  if (caps.acceptsTemperature && typeof opts.temperature === "number") chatBody.temperature = opts.temperature;

  const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.chat.completions.create(chatBody));
  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);
  return { model: (resp as any)?.model ?? model, usage, choices: [{ message: { content: text } }] };
}

export const callLLMOpenAI = callLLM;
export type { NormalizedLLMResponse as LLMResponse };
