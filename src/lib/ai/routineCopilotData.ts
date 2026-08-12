import "server-only";

import { generateAI } from "@/lib/ai/gateway";
import {
  buildRoutineCopilotProposal,
  type RoutineCopilotExtraction,
  type RoutineCopilotKind,
  type RoutineCopilotProposal,
} from "@/lib/routineCopilot";

function parseJsonObject(text: string): RoutineCopilotExtraction | null {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === "object" && !Array.isArray(value) ? value as RoutineCopilotExtraction : null;
  } catch {
    return null;
  }
}
function prompt(sourceText: string, kind: RoutineCopilotKind, existingName?: string | null) {
  return [
    {
      role: "system" as const,
      content: [
        "You extract member-entered regimen facts for LVE360. You do not recommend, correct, normalize, or infer any medication, hormone, supplement, dose, cadence, or time.",
        "Return only valid JSON with exactly these nullable string fields: name_quote, dose_quote, schedule_quote.",
        "Every non-null value must be an exact contiguous quote copied from the member text. Use null when the text does not explicitly contain the fact.",
        "dose_quote is the amount and unit taken at one scheduled time, not a guessed daily total.",
        "schedule_quote includes only explicit cadence, days, and timing wording. Never turn morning, evening, night, or bedtime into a clock time.",
        "Do not provide health advice, safety conclusions, clinician decisions, or explanations.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({ item_kind: kind, existing_item_name: existingName ?? null, member_text: sourceText }),
    },
  ];
}

export async function organizeRoutineInstructions({
  userId,
  sourceText,
  kind,
  existingName,
}: {
  userId: string;
  sourceText: string;
  kind: RoutineCopilotKind;
  existingName?: string | null;
}): Promise<RoutineCopilotProposal> {
  try {
    const response = await generateAI({
      task: "routine_label_parser",
      userId,
      messages: prompt(sourceText, kind, existingName),
      maxTokens: 180,
      timeoutMs: 20_000,
      temperature: 0,
    });
    return buildRoutineCopilotProposal({ sourceText, kind, existingName, extraction: parseJsonObject(response.text) });
  } catch (error) {
    console.warn("[routine-copilot] extraction unavailable; using deterministic organizer", error);
    return buildRoutineCopilotProposal({ sourceText, kind, existingName });
  }
}
