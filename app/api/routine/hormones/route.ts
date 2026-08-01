import { NextResponse } from "next/server";

import { upsertReportedHormone } from "@/lib/currentRegimen";
import { normalizeHormoneRecordInput } from "@/lib/medicationRecord";
import { requirePaidApi } from "@/lib/serverEntitlements";

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const input = normalizeHormoneRecordInput(await req.json().catch(() => null));
    const item = await upsertReportedHormone(entitlement.user.id, input);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hormone_add_failed";
    const invalid = /required|invalid/.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: invalid ? 400 : 500 });
  }
}
