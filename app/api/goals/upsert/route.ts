import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Who is calling?
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    // Accept numbers or strings, coerce safely to number|null
    const num = (x: any) => {
      if (x === null || x === undefined || x === "") return null;
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };

    const payload = {
      user_id: user.id,
      target_weight: num(body?.target_weight),
      target_sleep:  num(body?.target_sleep),
      target_energy: num(body?.target_energy),
      goals: Array.isArray(body?.goals) ? body.goals.map(String) : [],
      custom_goal: body?.custom_goal ? String(body.custom_goal).slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    };

    // Use service role so we don't depend on RLS being perfect
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { error: upsertErr } = await admin
      .from("goals")
      .upsert(payload, { onConflict: "user_id" });

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}
