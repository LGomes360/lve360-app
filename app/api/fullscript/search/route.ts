// app/api/fullscript/search/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

// --- Env ---
const FULLSCRIPT_BASE = process.env.FULLSCRIPT_BASE_URL || "https://api.fullscript.com";
const FULLSCRIPT_API_KEY = process.env.FULLSCRIPT_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Fallback query against your own supplements table when Fullscript keys are missing
async function fallbackSearch(q: string) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
  const { data, error } = await admin
    .from("supplements")
    .select("id, ingredient, product_name, link_fullscript, link_amazon, notes")
    .ilike("ingredient", `%${q}%`);

  if (error) return [];

  return (data ?? []).map((row) => ({
    vendor: "fallback",
    sku: row.id, // your own id as pseudo-sku
    name: row.product_name || row.ingredient,
    brand: null,
    dose: row.notes || null,
    link_fullscript: row.link_fullscript || null,
    link_amazon: row.link_amazon || null,
    price: null,
  }));
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
  return items.map((p: any) => ({
    vendor: "fullscript",
    sku: String(p?.id ?? ""),
    name: p?.attributes?.name ?? p?.name ?? "Unnamed",
    brand: p?.attributes?.brand_name ?? p?.brand?.name ?? null,
    dose: p?.attributes?.strength ?? null,
    link_fullscript: p?.links?.self ?? null,
    link_amazon: null,
    price: p?.attributes?.price ?? null,
  }));
}

export async function GET(req: Request) {
  try {
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
