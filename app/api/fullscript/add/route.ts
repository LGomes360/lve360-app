import { NextResponse } from "next/server";

import { upsertManualRegimenItem } from "@/lib/currentRegimen";
import { requirePaidApi } from "@/lib/serverEntitlements";

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const body = await req.json().catch(() => null) as {
      name?: string;
      dose?: string | null;
      timing?: string | null;
    } | null;
    const name = body?.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

    const item = await upsertManualRegimenItem(entitlement.user.id, {
      name,
      dose: body?.dose ?? null,
      timing: body?.timing ?? null,
      active: true,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "add_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
