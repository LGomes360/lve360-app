// app/api/users/tier/route.ts
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userIdParam = url.searchParams.get("userId");

    if (userIdParam) {
      if (!isUUID(userIdParam)) {
        console.warn("[users/tier] invalid userId:", userIdParam);
        return NextResponse.json({ error: "invalid userId" }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, tier")
        .eq("id", userIdParam)
        .maybeSingle();

      if (error) {
        console.error("[users/tier] admin read error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      console.log("[users/tier] by userId:", { userId: userIdParam, tier: data?.tier ?? null });
      return NextResponse.json({ ok: true, tier: data?.tier ?? null });
    }

    // Cookie session path
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error("[users/tier] auth error:", authErr);
    }
    if (!user?.id) {
      console.warn("[users/tier] unauthorized (no user)");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, tier")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[users/tier] cookie read error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.log("[users/tier] by cookie:", { userId: user.id, tier: data?.tier ?? null });
    return NextResponse.json({ ok: true, tier: data?.tier ?? null });
  } catch (e: any) {
    console.error("[users/tier] unhandled:", e);
    return NextResponse.json({ error: e?.message ?? "tier_failed" }, { status: 500 });
  }
}
