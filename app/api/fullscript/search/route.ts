// app/api/fullscript/search/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePaidApi } from "@/lib/serverEntitlements";
import { fullscriptImageUrlForSku, normalizeHttpsUrl, normalizeTrustedProductImageUrl } from "@/lib/supplementProduct";

// --- Env ---
const FULLSCRIPT_BASE = process.env.FULLSCRIPT_BASE_URL || "https://api.fullscript.com";
const FULLSCRIPT_API_KEY = process.env.FULLSCRIPT_API_KEY || "";

// Fallback query against your own supplements table when Fullscript keys are missing
async function fallbackSearch(q: string) {
  const admin = getSupabaseAdmin();
  const columns = "id, ingredient, product_name, link_fullscript, link_amazon, notes";
  const [ingredientMatches, productMatches] = await Promise.all([
    admin.from("supplements").select(columns).ilike("ingredient", `%${q}%`).limit(20),
    admin.from("supplements").select(columns).ilike("product_name", `%${q}%`).limit(20),
  ]);
  const rows = new Map<string, any>();
  for (const row of [...(ingredientMatches.data ?? []), ...(productMatches.data ?? [])]) {
    rows.set(String(row.id), row);
  }

  return [...rows.values()].slice(0, 20).map((row) => ({
    vendor: "fallback",
    sku: row.id, // your own id as pseudo-sku
    name: row.product_name || row.ingredient,
    brand: null,
    dose: row.notes || null,
    link_fullscript: row.link_fullscript || null,
    link_amazon: row.link_amazon || null,
    price: null,
    reorder_url: safeHttpsUrl(row.link_fullscript || row.link_amazon),
    image_url: null,
  }));
}

function safeHttpsUrl(value: unknown): string | null {
  try { return normalizeHttpsUrl(value); } catch { return null; }
}

function safeImageUrl(value: unknown): string | null {
  try { return normalizeTrustedProductImageUrl(value); } catch { return null; }
}

// Minimal Fullscript proxy (adjust endpoint to your account’s catalog/search)
async function fullscriptSearch(q: string) {
  const url = `${FULLSCRIPT_BASE}/v1/products?query=${encodeURIComponent(q)}&per_page=20`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${FULLSCRIPT_API_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fullscript error: ${res.status}`);
  const json = await res.json();

  // Normalize a few common fields
  const items = Array.isArray(json?.data) ? json.data : [];
  return items.map((p: any) => {
    const sku = String(p?.attributes?.sku ?? p?.attributes?.code ?? p?.id ?? "");
    const imageCandidate = p?.attributes?.image_url
      ?? p?.attributes?.image?.url
      ?? p?.attributes?.images?.[0]?.url
      ?? fullscriptImageUrlForSku(sku);
    const reorderCandidate = p?.attributes?.product_url
      ?? p?.attributes?.web_url
      ?? p?.links?.product
      ?? p?.links?.web
      ?? null;
    return {
      vendor: "fullscript",
      sku,
      name: p?.attributes?.name ?? p?.name ?? "Unnamed",
      brand: p?.attributes?.brand_name ?? p?.brand?.name ?? null,
      dose: p?.attributes?.strength ?? null,
      link_fullscript: safeHttpsUrl(reorderCandidate),
      link_amazon: null,
      price: p?.attributes?.price ?? null,
      reorder_url: safeHttpsUrl(reorderCandidate),
      image_url: safeImageUrl(imageCandidate),
    };
  });
}

export async function GET(req: Request) {
  try {
    const entitlement = await requirePaidApi();
    if (!entitlement.ok) return entitlement.response;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ ok: true, items: [] });

    // Auth not required to search, but we’ll still initialize client for consistency
    const cookieStore = cookies();
    createRouteHandlerClient({ cookies: () => cookieStore });

    let items: any[] = [];
    if (FULLSCRIPT_API_KEY) {
      try {
        items = await fullscriptSearch(q);
        if (!items.length) items = await fallbackSearch(q);
      } catch {
        // If Fullscript fails, fall back transparently
        items = await fallbackSearch(q);
      }
    } else {
      items = await fallbackSearch(q);
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "search_failed" }, { status: 500 });
  }
}
