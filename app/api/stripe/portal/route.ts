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

    // Lookup customer from your `users` table
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("stripe_customer_id")
      .eq("email", email)
      .maybeSingle();

    if (error || !user?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer not found for user" },
        { status: 404 }
      );
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Create a portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
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
