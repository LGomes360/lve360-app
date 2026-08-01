import { NextResponse } from "next/server";

import { upsertManualRegimenItem } from "@/lib/currentRegimen";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { isSupplementProductSource, normalizeHttpsUrl, normalizeTrustedProductImageUrl } from "@/lib/supplementProduct";

export async function POST(req: Request) {
  const entitlement = await requirePaidApi();
  if (!entitlement.ok) return entitlement.response;

  try {
    const body = await req.json().catch(() => null) as {
      name?: string;
      dose?: string | null;
      timing?: string | null;
      brand?: string | null;
      reorder_url?: string | null;
      image_url?: string | null;
      product_source?: string | null;
      product_sku?: string | null;
    } | null;
    const name = body?.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    if (body?.product_source && !isSupplementProductSource(body.product_source)) {
      return NextResponse.json({ ok: false, error: "invalid_product_source" }, { status: 400 });
    }
    const brand = body?.brand?.trim() || null;
    if (brand && brand.length > 120) return NextResponse.json({ ok: false, error: "invalid_brand" }, { status: 400 });

    const item = await upsertManualRegimenItem(entitlement.user.id, {
      name,
      dose: body?.dose ?? null,
      timing: body?.timing ?? null,
      brand,
      reorder_url: normalizeHttpsUrl(body?.reorder_url ?? null),
      image_url: normalizeTrustedProductImageUrl(body?.image_url ?? null),
      product_source: body?.product_source && isSupplementProductSource(body.product_source) ? body.product_source : null,
      product_sku: body?.product_sku?.trim().slice(0, 120) || null,
      active: true,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "add_failed";
    const invalid = /invalid|required/.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: invalid ? 400 : 500 });
  }
}
