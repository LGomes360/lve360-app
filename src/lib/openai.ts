// src/lib/openai.ts
/* eslint-disable no-console */

/**
 * Minimal wrapper around OpenAI Responses API that:
 *  - accepts classic chat-style messages [{role, content:string}]
 *  - converts them to Responses API "input" with type: "input_text"
 *  - DOES NOT send deprecated params (no `messages`, no `response_format`, no `text.format`)
 *  - normalizes the response so callers can read: choices[0].message.content, model, usage.*
 */

export type LVEMessage = { role: "system" | "user" | "assistant"; content: string };

type CallOpts = {
  temperature?: number;
  max?: number;          // preferred
  maxTokens?: number;    // legacy alias
  timeoutMs?: number;
};

export async function callLLM(
  messages: LVEMessage[],
  model: string,
  opts: CallOpts = {}
): Promise<{
  model: string;
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  choices: Array<{ message: { content: string } }>;
  llmRaw: any;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  // Convert classic messages → Responses API "input"
  const input = (messages || []).map((m) => ({
    role: m.role,
    content: [
      {
        // IMPORTANT: the new content type
        type: "input_text",
        text: typeof m.content === "string" ? m.content : String(m.content),
      },
    ],
  }));

  // Build request body — do NOT include response_format or text.format
  const body: any = {
    model,
    input,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  const max = opts.max ?? opts.maxTokens;
  if (typeof max === "number") body.max_output_tokens = max;

  // Basic fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).catch((e) => {
    clearTimeout(timeout);
    throw e;
  });

  clearTimeout(timeout);

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Surface the server’s exact complaint to logs
    const detail = json?.error?.message || JSON.stringify(json);
    const code = json?.error?.code || res.status;
    const err: any = new Error(detail);
    err.status = res.status;
    err.code = code;
    throw err;
  }

  // -------- Normalize output to a chat-like shape ---------------------------
  // Prefer `output_text`, then stitch from `output[].content[].text`, then old choices[] (if present).
  let text = "";
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    text = json.output_text.trim();
  } else if (Array.isArray(json.output)) {
    text = json.output
      .map((blk: any) =>
        Array.isArray(blk?.content)
          ? blk.content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("")
          : ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  } else if (Array.isArray(json.choices) && json.choices[0]?.message?.content) {
    text = String(json.choices[0].message.content).trim();
  }

  // Map usage to familiar fields
  const prompt_tokens =
    json?.usage?.input_tokens ?? json?.usage?.prompt_tokens ?? undefined;
  const completion_tokens =
    json?.usage?.output_tokens ?? json?.usage?.completion_tokens ?? undefined;
  const total_tokens =
    json?.usage?.total_tokens ??
    (prompt_tokens !== undefined && completion_tokens !== undefined
      ? prompt_tokens + completion_tokens
      : undefined);

  return {
    model: json?.model ?? model,
    usage: {
      total_tokens,
      prompt_tokens,
      completion_tokens,
    },
    choices: [{ message: { content: text } }],
    llmRaw: json,
  };
}

export default callLLM;
