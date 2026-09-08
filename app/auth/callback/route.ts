import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { hashInvitationToken, isInvitationToken } from "@/src/lib/invitationTokens";
import { getProductMode } from "@/src/lib/productMode";
import { getSupabaseAdmin } from "@/src/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ALLOW_NEXT_PATHS = new Set<string>([
  "/today", "/journey", "/blueprints", "/settings", "/dashboard",
  "/results", "/account", "/upgrade", "/premium", "/onboarding",
]);

function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/today";
  const target = new URL(raw, "https://app.lve360.com");
  if (!ALLOW_NEXT_PATHS.has(target.pathname)) return "/today";
  if (target.pathname !== "/upgrade") return target.pathname;
  const plan = target.searchParams.get("plan");
  return plan === "monthly" || plan === "annual" ? `/upgrade?plan=${plan}` : "/upgrade";
}

function loginError(origin: string, message: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/today";
  const invite = url.searchParams.get("invite");
  const errDesc = url.searchParams.get("error_description");
  const supabase = createRouteHandlerClient({ cookies });

  if (errDesc) return loginError(url.origin, errDesc);
  if (!code) return NextResponse.redirect(new URL("/login", url.origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginError(url.origin, error.message);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return loginError(url.origin, "Secure sign-in could not be verified.");

  if (invite !== null) {
    if (!getProductMode().invitationsOperationallyUnlocked || !isInvitationToken(invite) || !user.email) {
      await supabase.auth.signOut();
      return loginError(url.origin, "This invitation is invalid or no longer available.");
    }

    const admin = getSupabaseAdmin();
    const tokenHash = hashInvitationToken(invite);
    const { data: accepted, error: acceptanceError } = await admin.rpc("accept_private_invitation", {
      p_token_hash: tokenHash,
      p_user_id: user.id,
      p_email: user.email.toLowerCase(),
    });
    if (acceptanceError || accepted !== true) {
      const { error: rejectionAuditError } = await admin.rpc("record_private_invitation_rejection", {
        p_token_hash: tokenHash,
        p_user_id: user.id,
      });
      if (rejectionAuditError) {
        console.warn("invitation rejection audit failed", { userId: user.id, message: rejectionAuditError.message });
      }
      console.error("invitation acceptance failed", { userId: user.id, message: acceptanceError?.message ?? "not accepted" });
      await supabase.auth.signOut();
      return loginError(url.origin, "This invitation is invalid, expired, used, or belongs to another email address.");
    }
  } else {
    try {
      await fetch(new URL("/api/provision-user", req.url), {
        method: "POST",
        headers: { cookie: (await cookies()).toString() },
      });
    } catch {}
  }

  return NextResponse.redirect(new URL(safeNext(next), url.origin));
}
