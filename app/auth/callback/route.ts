// app/auth/callback/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic"; // ensure server executes per request

// Only allow safe "next" values to avoid open redirects
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

  // 1) Exchange the code for a session and set cookies
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  } else {
    // no code → send to login
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // 2) Sanitize next and redirect. Page-level guards will handle premium.
  const dest = ALLOW_NEXT.has(next) ? next : "/dashboard";
  return NextResponse.redirect(new URL(dest, url.origin));
}
