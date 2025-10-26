// app/api/debug/session/route.ts
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = false;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr) {
      console.error("[DBG/session] auth error:", authErr);
    }

    let dbRow: any = null;
    if (user?.id) {
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, email, tier, stripe_customer_id, stripe_subscription_status, billing_interval, subscription_end_date, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[DBG/session] users fetch error:", error);
      }
      dbRow = data ?? null;
    }

    const summary = {
      ok: true,
      auth_user: user ? { id: user.id, email: user.email } : null,
      db_user: dbRow,
    };

    console.log("[DBG/session] summary:", summary);
    return NextResponse.json(summary);
  } catch (e: any) {
    console.error("[DBG/session] unhandled:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "debug_failed" }, { status: 500 });
  }
}
