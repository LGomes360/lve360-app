// app/api/users/tier/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase"; // if you prefer admin, keep it; otherwise client is fine

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userIdParam = url.searchParams.get("userId");

    // If no userId provided, try the current cookie session
    if (!userIdParam) {
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

      const { data, error } = await supabase
        .from("users")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ ok: true, tier: null });

      return NextResponse.json({ ok: true, tier: data.tier ?? null });
    }

    // When userId is present, validate then fetch (admin-safe)
    const userId = userIdParam.trim();
    if (!isUUID(userId)) {
      return NextResponse.json({ error: "invalid userId" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("tier")
      .eq("id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: true, tier: null });

    return NextResponse.json({ ok: true, tier: data.tier ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "tier_failed" }, { status: 500 });
  }
}
