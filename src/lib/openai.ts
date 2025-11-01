/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// OpenAI wrapper supporting BOTH:
//   • GPT-5 family via Responses API (instructions + input w/ type:"input_text")
//   • GPT-4/4o/4.1/etc via Chat Completions API
// One call signature for everything:
//   callLLM(model, messagesOrString, { maxTokens?, temperature?, timeoutMs? })
// Returns a uniform shape with .text and .modelUsed.
// ---------------------------------------------------------------------------

import OpenAI from "openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallOpts = {
  maxTokens?: number;
  max?: number; // alias
  temperature?: number;
  timeoutMs?: number; // default 60s
};

export type LLMResult = {
  modelUsed: string;
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  choices: Array<{ message: { content: string } }>;
  raw?: unknown;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT || undefined,
});

// ------------------------------- helpers -----------------------------------
type Caps = {
  family: "responses" | "chat";
  acceptsTemperature: boolean;
  maxKey: "max_output_tokens" | "max_tokens" | "max_completion_tokens";
};

function isGpt5(model: string) {
  return model.toLowerCase().startsWith("gpt-5");
}

function modelCaps(model: string): Caps {
  if (isGpt5(model)) {
    return {
      family: "responses",
      acceptsTemperature: false, // GPT-5 often ignores/doesn't accept temp
      maxKey: "max_output_tokens",
    };
  }
  return {
    family: "chat",
    acceptsTemperature: true,
    maxKey: "max_tokens",
  };
}

function clampMaxFor(caps: Caps, v?: number) {
  if (typeof v !== "number") return undefined;
  let val = v;
  if (caps.family === "responses" && val < 16) val = 16; // GPT-5 minimum
  if (val > 8192) val = 8192;
  return { key: caps.maxKey, value: val };
}

function withTimeout<T>(ms: number | undefined, p: Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`OpenAI call timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// --------- Responses API (GPT-5) content & extraction (text-only) ----------
function splitSystemAndRest(msgs: ChatMessage[]) {
  const systems = msgs.filter((m) => m.role === "system").map((m) => m.content);
  const nonSystem = msgs.filter((m) => m.role !== "system");
  const instructions = systems.join("\n\n");
  const input = nonSystem.map((m) => ({
    role: m.role,
    // IMPORTANT: GPT-5 expects 'input_text' (not 'text')
    content: [{ type: "input_text", text: m.content }],
  }));
  return { instructions, input };
}

function pickTextFromResponses(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text.trim();

  // Walk output/content trees and collect any strings
  const collect = (node: any): string[] => {
    if (!node) return [];
    if (typeof node === "string") return [node];
    if (Array.isArray(node)) return node.flatMap(collect);
    const out: string[] = [];
    if (typeof node.text === "string") out.push(node.text);
    if (typeof node.content === "string") out.push(node.content);
    if (Array.isArray(node.content)) out.push(...node.content.flatMap(collect));
    if (Array.isArray(node.output)) out.push(...node.output.flatMap(collect));
    return out;
  };

  const chunks = [
    ...collect(raw?.output),
    ...collect(raw?.content),
  ].filter(Boolean);

  return chunks.join("\n").trim();
}

function usageFromResponses(raw: any) {
  const input = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? null;
  const output = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? null;
  const total =
    raw?.usage?.total_tokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : null);
  return { total, input, output };
}

// -------------------------- Chat Completions path --------------------------
function toChatMessages(msgs: ChatMessage[]) {
  return msgs.map((m) => ({ role: m.role, content: m.content } as const));
}

function usageFromChat(raw: any) {
  const u = raw?.usage ?? {};
  return {
    total: typeof u.total_tokens === "number" ? u.total_tokens : null,
    input: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
    output: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
  };
}

// --------------------------------- API -------------------------------------
export async function callLLM(
  model: string,
  messagesOrString: ChatMessage[] | string,
  opts: CallOpts = {}
): Promise<LLMResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const msgs: ChatMessage[] = Array.isArray(messagesOrString)
    ? messagesOrString
    : [{ role: "user", content: String(messagesOrString) }];

  const caps = modelCaps(model);
  const maxWanted = typeof opts.maxTokens === "number" ? opts.maxTokens : opts.max;
  const maxCfg = clampMaxFor(caps, maxWanted);

  if (caps.family === "responses") {
    // GPT-5 via Responses API (canonical fields)
    const { instructions, input } = splitSystemAndRest(msgs);
    const body: any = {
      model,
      input: input.length ? input : [{ role: "user", content: [{ type: "input_text", text: "ping" }] }],
    };
    if (instructions) body.instructions = instructions;
    if (maxCfg) body[maxCfg.key] = maxCfg.value;
    // DO NOT send: response_format, modalities, or text.format

    const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.responses.create(body));
    const text = pickTextFromResponses(resp);
    const usage = usageFromResponses(resp);

    return {
      modelUsed: (resp as any)?.model ?? model,
      text,
      promptTokens: usage.input,
      completionTokens: usage.output,
      totalTokens: usage.total,
      choices: [{ message: { content: text } }],
      raw: resp,
    };
  }

  // GPT-4/4o/4.1/etc via Chat Completions
  const chatBody: any = { model, messages: toChatMessages(msgs) };
  if (maxCfg) chatBody[maxCfg.key] = maxCfg.value;
  if (caps.acceptsTemperature && typeof opts.temperature === "number") {
    chatBody.temperature = opts.temperature;
  }

  const resp = await withTimeout(opts.timeoutMs ?? 60_000, client.chat.completions.create(chatBody));
  const text = (resp?.choices?.[0]?.message?.content ?? "").trim();
  const usage = usageFromChat(resp);

  return {
    modelUsed: (resp as any)?.model ?? model,
    text,
    promptTokens: usage.input,
    completionTokens: usage.output,
    totalTokens: usage.total,
    choices: [{ message: { content: text } }],
    raw: resp,
  };
}

// Back-compat alias
export const callOpenAI = callLLM;
// Compat export for older imports
export type { LLMResult as NormalizedLLMResponse };
