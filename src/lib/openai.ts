/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable no-console */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type CallOpts = {
  max?: number;          // preferred alias
  maxTokens?: number;    // legacy alias
  temperature?: number;
};

/**
 * Convert Chat-style messages into Responses API "input" array with typed content parts.
 * We only emit input_text parts here (images/files not needed for LVE360).
 */
function toResponsesInput(messages: ChatCompletionMessageParam[]) {
  return messages.map((m) => {
    const role = (m.role as "system" | "user" | "assistant") ?? "user";

    // Flatten possible array content into one string
    let text = "";
    if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content
        .map((p: any) => {
          if (typeof p === "string") return p;
          if (p && typeof p.text === "string") return p.text;
          if (p && typeof p.content === "string") return p.content;
          return "";
        })
        .join("");
    } else if (m && (m as any).content) {
      text = String((m as any).content);
    }

    return {
      role,
      content: [
        {
          type: "input_text" as const,
          text,
        },
      ],
    };
  });
}

/**
 * callLLM(messages, model, opts?) → returns an object that always has:
 * { model, usage, choices: [{ message: { content } }] }
 * so existing callers can read .choices[0].message.content safely.
 *
 * For gpt-5* we use Responses API.
 * For older models we use Chat Completions.
 */
export async function callLLM(
  messages: ChatCompletionMessageParam[],
  model: string,
  opts: CallOpts = {}
): Promise<{
  model: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  choices: Array<{ message: { content: string } }>;
}> {
  const useResponses = /^gpt-5/i.test(model);

  const max =
    typeof opts.max === "number"
      ? opts.max
      : typeof opts.maxTokens === "number"
      ? opts.maxTokens
      : undefined;

  if (useResponses) {
    // ----- Responses API path -----
    const body: any = {
      model,
      input: toResponsesInput(messages),
    };
    if (typeof max === "number") body.max_output_tokens = max;
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;

    // IMPORTANT: do NOT send response_format or text.format unless you
    // intentionally need structured outputs. Defaults to plain text.
    const r = await client.responses.create(body);

    // Prefer the convenience string if present; otherwise stitch output parts.
    const textFromParts =
      (Array.isArray((r as any).output)
        ? (r as any).output
            .filter((p: any) => p?.type === "output_text")
            .map((p: any) => p?.text ?? p?.content ?? "")
            .join("")
        : "") || "";

    const content = (r as any).output_text
      ? String((r as any).output_text)
      : textFromParts;

    // Normalize usage fields
    const usage = r.usage
      ? {
          total_tokens: (r.usage as any).total_tokens,
          prompt_tokens: (r.usage as any).prompt_tokens ?? (r.usage as any).input_tokens,
          completion_tokens:
            (r.usage as any).completion_tokens ?? (r.usage as any).output_tokens,
          input_tokens: (r.usage as any).input_tokens,
          output_tokens: (r.usage as any).output_tokens,
        }
      : undefined;

    return {
      model: (r as any).model ?? model,
      usage,
      choices: [
        {
          message: { content: String(content ?? "").trim() },
        },
      ],
    };
  }

  // ----- Chat Completions path (older models) -----
  const chatBody: any = {
    model,
    messages,
  };
  if (typeof max === "number") chatBody.max_tokens = max;
  if (typeof opts.temperature === "number") chatBody.temperature = opts.temperature;

  const r = await client.chat.completions.create(chatBody);
  return r as unknown as {
    model: string;
    usage?: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
    choices: Array<{ message: { content: string } }>;
  };
}

export { ChatCompletionMessageParam };
export default { callLLM };
