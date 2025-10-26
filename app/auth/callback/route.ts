// app/auth/callback/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic"; // ensure server executes per request

// Allowed destinations (prefix match) — query strings are OK.
const ALLOW_PREFIXES = ["/dashboard", "/results", "/account"];

/** Ensure "next" is a safe, same-origin relative path under an allowed prefix. */
function sanitizeNext(raw: string | null | undefined): string {
  const next = (raw || "/dashboard").trim();
  // Must be relative, start with single '/', and not be protocol-relative ('//...')
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  // Allow prefix matches like /dashboard, /dashboard?tab=...
  for (const p of ALLOW_PREFIXES) {
    if (next === p || next.startsWith(`${p}?`) || next.startsWith(`${p}/`)) {
      return next;
    }
  }
  return "/dashboard";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const next = sanitizeNext(url.searchParams.get("next"));

    const supabase = createRouteHandlerClient({ cookies });

    // If they already have a session, just bounce them to the destination.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session && !code) {
      return NextResponse.redirect(new URL(next, url.origin));
    }

    // Exchange the code for a session and set auth cookies
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession error:", error.message);
        const to = new URL("/login", url.origin);
        to.searchParams.set("error", error.message);
        return NextResponse.redirect(to);
      }
    } else {
      // No code and no session → back to login
      return NextResponse.redirect(new URL("/login", url.origin));
    }

    // Success → go where they intended
    return NextResponse.redirect(new URL(next, url.origin));
  } catch (err: any) {
    console.error("[auth/callback] unhandled:", err?.message ?? err);
    // Last-resort: send to login with an error
    const url = new URL(req.url);
    const to = new URL("/login", url.origin);
    to.searchParams.set("error", "Auth callback failed");
    return NextResponse.redirect(to);
  }
}
