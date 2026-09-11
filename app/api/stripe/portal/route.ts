// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { resolveAccountAccess } from "@/lib/accessModel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve billing data from the authenticated profile used by dashboard gating.
    const { data: profile, error } = await supabaseAdmin
      .from("users")
      .select("id, stripe_customer_id, tier, access_status, billing_mode, billing_interval")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase user lookup error:", error.message);
      return NextResponse.json({ error: "User lookup failed" }, { status: 500 });
    }

    const access = resolveAccountAccess(profile);
    if (access.billingMode !== "stripe_monthly" && access.billingMode !== "stripe_annual") {
      return NextResponse.json(
        { error: "Billing management is unavailable for this membership." },
        { status: 403 },
      );
    }

    const stripeCustomerId = profile?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "Stripe billing record is incomplete. Please contact support." },
        { status: 409 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    if (!appUrl) {
      return NextResponse.json({ error: "Missing app URL configuration" }, { status: 500 });
    }

    // Create a portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("❌ Stripe portal error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
