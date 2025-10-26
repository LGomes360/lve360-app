// app/api/users/tier/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase"; // ✅ keep your import style
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// Never statically optimized or cached
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase envs missing." }, { status: 500 });
    }

    // Allow calling with or without ?userId=
    const userIdParam = req.nextUrl.searchParams.get("userId")?.trim() || null;

    let userId = userIdParam;
    if (!userId) {
      // derive current session user id if none provided
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      userId = user.id;
    }

    if (!isUUID(userId!)) {
      return NextResponse.json({ error: "invalid userId" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("tier")
      .eq("id", userId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({ ok: true, tier: data.tier ?? "free" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
