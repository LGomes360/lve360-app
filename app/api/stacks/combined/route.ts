import { NextResponse } from "next/server";

import { getRoutineData } from "@/lib/routineData";
import { requirePaidApi } from "@/lib/serverEntitlements";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const data = await getRoutineData(entitlement.user.id);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "current_regimen_failed";
    console.error("[stacks/combined] failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
