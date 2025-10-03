// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    // Find Stripe customer by email (assumes you've stored stripe_customer_id in users)
    const { data: user } = await supabaseAdmin.from("users").select("stripe_customer_id").eq("email", email).maybeSingle();

    let customerId = user?.stripe_customer_id;

    if (!customerId) {
      // Fallback: lookup in Stripe directly
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length) {
        customerId = customers.data[0].id;

        // Save for next time
        await supabaseAdmin.from("users").update({ stripe_customer_id: customerId }).eq("email", email);
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "Stripe customer not found" }, { status: 404 });
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "/";

    // Create a customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Portal error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
