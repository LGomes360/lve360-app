// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      console.error("❌ Missing email in portal request");
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    console.log(`🔑 Stripe portal requested for email: ${email}`);

    // Lookup user by email (include tier for debugging)
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, stripe_customer_id, tier")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase user lookup error:", error.message);
      return NextResponse.json({ error: "User lookup failed" }, { status: 500 });
    }

    console.log("🗄️ Supabase user lookup result:", user);

    let stripeCustomerId = user?.stripe_customer_id ?? null;

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
          .eq("email", email);

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

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create a portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${APP_URL}/dashboard`,
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
