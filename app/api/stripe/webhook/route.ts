// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!endpointSecret || !stripeKey) {
      return NextResponse.json({ error: "Stripe envs not configured." }, { status: 500 });
    }

    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature") || "";

    // Use an API version matching installed stripe types
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    try {
      const event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        await supabaseAdmin.from("stripe_events").insert([{ id: session.id, raw: session }]);
      }
      return NextResponse.json({ received: true });
    } catch (err: any) {
      return NextResponse.json({ error: "Invalid webhook: " + (err?.message ?? String(err)) }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
