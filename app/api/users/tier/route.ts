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

type Tier = "free" | "premium";

function asTier(v: any): Tier {
  return v === "premium" ? "premium" : "free";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userIdParam = url.searchParams.get("userId");

    // --- A) Explicit admin-style lookup: /api/users/tier?userId={uuid}
    if (userIdParam) {
      if (!isUUID(userIdParam)) {
        console.warn("[users/tier] invalid userId:", userIdParam);
        return NextResponse.json({ ok: false, error: "invalid userId" }, { status: 400 });
      }

      try {
        const { data, error } = await supabaseAdmin
          .from("users")
          .select("id,tier")
          .eq("id", userIdParam)
          .maybeSingle();

        if (error) {
          console.warn("[users/tier] admin read error, falling back to free:", error.message);
          return NextResponse.json({ ok: true, tier: "free", user_id: userIdParam }, { status: 200 });
        }

        const tier = asTier(data?.tier);
        return NextResponse.json({ ok: true, tier, user_id: userIdParam }, { status: 200 });
      } catch (e: any) {
        console.warn("[users/tier] admin read exception, falling back to free:", e?.message || e);
        return NextResponse.json({ ok: true, tier: "free", user_id: userIdParam }, { status: 200 });
      }
    }

    // --- B) Cookie-session path: anonymous-safe (default to free)
    const supabase = createRouteHandlerClient({ cookies });

    // Use getSession (tolerates missing session) instead of getUser (which can throw)
    const {
      data: { session },
      error: sessErr,
    } = await supabase.auth.getSession();

    if (sessErr) {
      console.warn("[users/tier] getSession error, defaulting to free:", sessErr.message);
      return NextResponse.json({ ok: true, tier: "free", user_id: null }, { status: 200 });
    }

    const userId = session?.user?.id ?? null;

    // No session → anonymous visitor → free
    if (!userId) {
      return NextResponse.json({ ok: true, tier: "free", user_id: null }, { status: 200 });
    }

    // Has session: read user's tier (RLS-safe; tolerate failure → free)
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id,tier")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[users/tier] cookie read error, defaulting to free:", error.message);
        return NextResponse.json({ ok: true, tier: "free", user_id: userId }, { status: 200 });
      }

      const tier = asTier(data?.tier);
      return NextResponse.json({ ok: true, tier, user_id: userId }, { status: 200 });
    } catch (e: any) {
      console.warn("[users/tier] cookie read exception, defaulting to free:", e?.message || e);
      return NextResponse.json({ ok: true, tier: "free", user_id: userId }, { status: 200 });
    }
  } catch (e: any) {
    // Last-resort fallback — never block UI; just report free
    console.warn("[users/tier] unhandled, defaulting to free:", e?.message || e);
    return NextResponse.json({ ok: true, tier: "free", user_id: null }, { status: 200 });
  }
}
