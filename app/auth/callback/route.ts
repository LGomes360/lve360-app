// app/auth/callback/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic"; // ensure server executes per request

// Optional: only allow these "next" values to avoid open redirects
const ALLOW_NEXT = new Set<string>([
  "/dashboard",
  "/results",
  "/account",
]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  const supabase = createRouteHandlerClient({ cookies });

  // 1) Exchange the auth code for a session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // If auth failed, go back to login
      return NextResponse.redirect(new URL("/login", url.origin));
    }
  }

  // 2) Read the now-current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  // 3) Ensure the user has a row in public.users (defaults to free)
  //    Idempotent: upsert by primary key id
  await supabase
    .from("users")
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: "id" });

  // 4) Fetch tier and route accordingly
  const { data: me } = await supabase
    .from("users")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  const tier = me?.tier ?? "free";
  const dest = ALLOW_NEXT.has(next) ? next : "/dashboard";

  if (!["premium", "trial"].includes(tier)) {
    // Not premium → upgrade page
    return NextResponse.redirect(new URL("/upgrade", url.origin));
  }

  // Premium/trial → allow through
  return NextResponse.redirect(new URL(dest, url.origin));
}
