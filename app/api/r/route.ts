// app/api/r/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("u"); // REQUIRED (encoded)
    const src = url.searchParams.get("src") || "amazon";
    const submissionId = url.searchParams.get("submission_id");
    const stackId = url.searchParams.get("stack_id");
    const item = url.searchParams.get("item");

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing u (destination)" },
        { status: 400 }
      );
    }

    // Decode & validate destination
    const dest = decodeURIComponent(raw);
    if (!/^https?:\/\//i.test(dest)) {
      return NextResponse.json(
        { ok: false, error: "Invalid destination" },
        { status: 400 }
      );
    }

    // Best-effort log (do not block redirect)
    try {
      await supabaseAdmin.from("link_clicks").insert({
        submission_id: submissionId,
        stack_id: stackId,
        item_name: item,
        dest: src,
        url: dest,
        user_agent: req.headers.get("user-agent"),
        ip: req.headers.get("x-forwarded-for"),
        referrer: req.headers.get("referer"),
      });
    } catch (e) {
      console.warn("[/api/r] log failed:", e);
    }

    // 302 → affiliate destination
    return NextResponse.redirect(dest, { status: 302 });
  } catch (err: any) {
    console.error("[/api/r] unhandled:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
