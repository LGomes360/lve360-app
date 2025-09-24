// app/api/stacks/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[API] Supabase env vars missing");
      return NextResponse.json({ error: "Supabase envs not configured." }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from("stacks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[API] Error fetching stacks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[API] GET /api/stacks - returning", data?.length ?? 0, "stacks");
    return NextResponse.json({ ok: true, stacks: data ?? [] });
  } catch (err: any) {
    console.error("[API] Exception in /api/stacks:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
