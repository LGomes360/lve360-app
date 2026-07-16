// app/auth/callback/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

// Only allow safe next values to avoid open redirects
const ALLOW_NEXT_PATHS = new Set<string>([
  "/dashboard",
  "/results",
  "/account",
  "/upgrade",
  "/premium",
  "/onboarding",
]);

function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  const target = new URL(raw, "https://app.lve360.com");
  if (!ALLOW_NEXT_PATHS.has(target.pathname)) return "/dashboard";
  if (target.pathname !== "/upgrade") return target.pathname;
  const plan = target.searchParams.get("plan");
  return plan === "monthly" || plan === "annual"
    ? `/upgrade?plan=${plan}`
    : "/upgrade";
}

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
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  try {
    await fetch(new URL("/api/provision-user", req.url), { method: "POST", headers: { cookie: (await cookies()).toString() } });
  } catch {}
}

  // All good → redirect to a safe next page
  const dest = safeNext(next);
  return NextResponse.redirect(new URL(dest, url.origin));
}
