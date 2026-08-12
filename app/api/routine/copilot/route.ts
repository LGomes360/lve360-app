import { NextResponse } from "next/server";

import { organizeRoutineInstructions } from "@/lib/ai/routineCopilotData";
import { getCurrentRegimen } from "@/lib/currentRegimen";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { addRoutineScheduleContext, type RoutineCopilotKind } from "@/lib/routineCopilot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KINDS: RoutineCopilotKind[] = ["medication", "hormone", "supplement", "endocrine_active_supplement"];

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const body = await req.json().catch(() => null);
    const sourceText = typeof body?.sourceText === "string" ? body.sourceText.replace(/\s+/g, " ").trim() : "";
    const kind = body?.kind as RoutineCopilotKind;
    const existingName = typeof body?.existingName === "string" ? body.existingName.trim().slice(0, 120) : null;
    if (!KINDS.includes(kind) || sourceText.length < 3 || sourceText.length > 1200) {
      return NextResponse.json({ ok: false, error: "invalid_routine_instructions" }, { status: 400 });
    }

    const [proposal, currentItems] = await Promise.all([
      organizeRoutineInstructions({ userId: entitlement.user.id, sourceText, kind, existingName }),
      getCurrentRegimen(entitlement.user.id),
    ]);
    return NextResponse.json({ ok: true, proposal: addRoutineScheduleContext(proposal, currentItems, existingName) });
  } catch (error) {
    console.error("[routine-copilot] request failed", error);
    return NextResponse.json({ ok: false, error: "routine_copilot_unavailable" }, { status: 500 });
  }
}
