// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  try {
    const sig = (req.headers.get("stripe-signature") ?? "").toString();
    const buf = await req.arrayBuffer();
    const raw = Buffer.from(buf);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
    } catch (err: any) {
      return NextResponse.json({ error: "Webhook signature verification failed", details: String(err?.message ?? err) }, { status: 400 });
    }

    // Deduplicate persistence
    const eventId = event.id;
    const { data: existing } = await supabaseAdmin.from("stripe_events").select("id").eq("id", eventId).single();
    if (existing) return NextResponse.json({ received: true, deduped: true }, { status: 200 });

    await supabaseAdmin.from("stripe_events").insert([{ id: eventId, raw: event, created_at: new Date().toISOString() }]);

    // Handle important events
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_details?.email ?? session.metadata?.email ?? null;

      // Example: elevate user to 'premium' and store subscription info.
      // Adjust to your schema: users table columns, subscriptions table, tier names, etc.
      if (email) {
        // Upsert user if not present
        await supabaseAdmin.from("users").upsert({ email }, { onConflict: ["email"] });

        // Mark user as premium (example)
        // NOTE: replace this with your actual logic (subscription rows, tier mapping, metadata)
        await supabaseAdmin.from("users").update({ tier: "premium" }).eq("email", email);
      }

      // Optionally persist subscription details in `subscriptions` table (if you have one)
      if ((session.subscription as any) || session.mode === "subscription") {
        const subscriptionId = (session.subscription as string) ?? null;
        if (subscriptionId) {
          await supabaseAdmin
            .from("subscriptions")
            .upsert({
              id: subscriptionId,
              customer: session.customer,
              price: session.metadata?.price_id ?? null,
              status: "active",
              raw: session,
            })
            .select();
        }
      }
    }

    // Handle subscription updates / cancellations -> sync to DB (similar pattern)
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });
      // Optionally update user tier based on subscriptions table
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
