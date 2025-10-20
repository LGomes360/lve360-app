// app/api/r/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Build an Amazon search URL with affiliate tag
function buildAmazonSearch(item: string): string {
  const q = encodeURIComponent(item.trim());
  const tag = "lve360-20";
  return `https://www.amazon.com/s?k=${q}&tag=${tag}`;
}

// Basic URL safety: allow http/https and reject data:, javascript:, etc.
function isSafeHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const u = req.nextUrl;

    // Inputs
    const rawU = u.searchParams.get("u"); // encoded target (optional if we can fallback)
    const src = (u.searchParams.get("src") || "amazon").toLowerCase();
    const submissionId = u.searchParams.get("submission_id");
    const stackId = u.searchParams.get("stack_id");
    const item = u.searchParams.get("item");

    // Determine destination:
    // 1) Use provided `u` if it decodes to a safe http(s) URL.
    // 2) Else, if src=amazon and we have an item name, send to Amazon search with affiliate tag.
    // 3) Else, 400.
    let dest: string | null = null;

    if (rawU) {
      const decoded = decodeURIComponent(rawU);
      if (isSafeHttpUrl(decoded)) {
        dest = decoded;
      }
    }

    if (!dest && src === "amazon" && item && item.trim().length > 0) {
      dest = buildAmazonSearch(item);
    }

    if (!dest) {
      const res = NextResponse.json(
        { ok: false, error: "Missing or invalid destination, and no valid fallback." },
        { status: 400 }
      );
      res.headers.set("Cache-Control", "no-store, max-age=0");
      return res;
    }

    // Best-effort logging (non-blocking)
    try {
      await supabaseAdmin.from("link_clicks").insert({
        submission_id: submissionId,
        stack_id: stackId,
        item_name: item,
        dest: src, // source label, e.g., "amazon" or "fullscript"
        url: dest, // final resolved URL
        user_agent: req.headers.get("user-agent"),
        ip: req.headers.get("x-forwarded-for") || req.ip || null,
        referrer: req.headers.get("referer"),
      });
    } catch (e) {
      console.warn("[/api/r] log failed:", e);
    }

    // Redirect (302) to the resolved destination
    const redirect = NextResponse.redirect(dest, { status: 302 });
    redirect.headers.set("Cache-Control", "no-store, max-age=0");
    return redirect;
  } catch (err: any) {
    console.error("[/api/r] unhandled:", err);
    const res = NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  }
}
