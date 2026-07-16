// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.id || !authUser.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = authUser.email.toLowerCase();

    console.log(`🔑 Stripe portal requested for email: ${email}`);

    // Resolve billing data from the authenticated profile used by dashboard gating.
    const { data: profile, error } = await supabaseAdmin
      .from("users")
      .select("id, stripe_customer_id, tier")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase user lookup error:", error.message);
      return NextResponse.json({ error: "User lookup failed" }, { status: 500 });
    }

    console.log("🗄️ Supabase user lookup result:", profile);

    let stripeCustomerId = profile?.stripe_customer_id ?? null;

    // 🛠 Backfill safeguard: if missing, try to find customer in Stripe
    if (!stripeCustomerId) {
      console.warn(`⚠️ No stripe_customer_id for ${email}, attempting backfill...`);

      const customers = await stripe.customers.list({
        email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;

        // Backfill into Supabase users table
        await supabaseAdmin
          .from("users")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", authUser.id);

        console.log(`✅ Backfilled stripe_customer_id for ${email}: ${stripeCustomerId}`);
      } else {
        console.error(`❌ No matching Stripe customer found for ${email}`);
      }
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "Stripe customer not found for user" },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    if (!appUrl) {
      return NextResponse.json({ error: "Missing app URL configuration" }, { status: 500 });
    }

    // Create a portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/account`,
    });

    console.log(`✅ Created Stripe portal session for ${email}`);

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("❌ Stripe portal error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
