// app/api/r/route.ts
// Force dynamic execution (no prerender) and disable caching.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "no-store";

import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Src = "amazon" | "fullscript" | "thorne" | "other";

export async function GET(req: NextRequest) {
  try {
    // Use nextUrl so this route isn't analyzed as static
    const u = req.nextUrl;

    const raw = u.searchParams.get("u"); // REQUIRED (encoded)
    const src = (u.searchParams.get("src") as Src) || "amazon";
    const submissionId = u.searchParams.get("submission_id");
    const stackId = u.searchParams.get("stack_id");
    const item = u.searchParams.get("item");

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing u (destination)" },
        { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Decode & validate destination
    const destDecoded = decodeURIComponent(raw);
    if (!/^https?:\/\//i.test(destDecoded)) {
      return NextResponse.json(
        { ok: false, error: "Invalid destination" },
        { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Construct a proper URL instance (NextResponse.redirect accepts string or URL)
    let dest: URL;
    try {
      dest = new URL(destDecoded);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Malformed URL" },
        { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Best-effort log (non-blocking)
    try {
      await supabaseAdmin.from("link_clicks").insert({
        submission_id: submissionId,
        stack_id: stackId,
        item_name: item,
        dest: src,
        url: dest.toString(),
        user_agent: req.headers.get("user-agent"),
        ip:
          req.headers.get("x-forwarded-for") ??
          req.headers.get("x-real-ip") ??
          null,
        referrer: req.headers.get("referer"),
      });
    } catch (e) {
      console.warn("[/api/r] log failed:", e);
      // do not block the redirect
    }

    // 302 → affiliate destination (no-store to avoid CDN caching oddities)
    const res = NextResponse.redirect(dest, 302);
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (err: any) {
    console.error("[/api/r] unhandled:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
