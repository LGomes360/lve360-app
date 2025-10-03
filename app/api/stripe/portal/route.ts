// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2023-10-16",
});

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    // Lookup user by email
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, stripe_customer_id")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("Supabase user lookup error:", error.message);
      return NextResponse.json({ error: "User lookup failed" }, { status: 500 });
    }

    let stripeCustomerId = user?.stripe_customer_id ?? null;

    // 🛠 Backfill safeguard: if missing, try to find customer in Stripe
    if (!stripeCustomerId) {
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

        console.log(`Backfilled stripe_customer_id for ${email}: ${stripeCustomerId}`);
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

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Stripe portal error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
