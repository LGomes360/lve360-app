// app/auth/callback/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

// Only allow safe next values to avoid open redirects
const ALLOW_NEXT = new Set<string>([
  "/dashboard",
  "/results",
  "/account",
  "/upgrade",
  "/premium",
  "/onboarding",
]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";
  const errDesc = url.searchParams.get("error_description");

  const supabase = createRouteHandlerClient({ cookies });

  if (errDesc) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errDesc)}`, url.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  // All good → redirect to a safe next page
  const dest = ALLOW_NEXT.has(next) ? next : "/dashboard";
  return NextResponse.redirect(new URL(dest, url.origin));
}
