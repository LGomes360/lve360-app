// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature") ?? "";
    const buf = Buffer.from(await req.arrayBuffer());

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
    } catch (err: any) {
      return NextResponse.json({ error: "Webhook signature verification failed", details: err?.message }, { status: 400 });
    }

    // Deduplicate
    const eventId = event.id;
    const { data: existing } = await supabaseAdmin.from("stripe_events").select("id").eq("id", eventId).single();
    if (existing) return NextResponse.json({ received: true, deduped: true }, { status: 200 });

    await supabaseAdmin.from("stripe_events").insert([{ id: eventId, raw: event, created_at: new Date().toISOString() }]);

    // === Handle checkout success ===
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_details?.email ?? session.metadata?.email ?? null;
      const stripeCustomerId = session.customer as string;

      if (email) {
        // 1. Ensure auth.users entry
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (createErr && createErr.message !== "User already registered") {
          console.error("Error creating auth user:", createErr.message);
        }
        const authId = created?.user?.id ?? undefined;

        // 2. Upsert into users table
        await supabaseAdmin.from("users").upsert(
          {
            id: authId, // if available
            email,
            tier: "premium",
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_status: "active",
          },
          { onConflict: "email" }
        );
      }

      // 3. Persist subscription details
      if (session.subscription) {
        const subId = session.subscription as string;
        await supabaseAdmin.from("subscriptions").upsert({
          id: subId,
          customer: stripeCustomerId,
          price: session.line_items?.[0]?.price?.id ?? null, // safer than metadata
          status: "active",
          raw: session,
        });
      }
    }

    // === Handle subscription lifecycle updates ===
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;

      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });

      // Downgrade on cancel/unpaid
      if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
        const customer = await stripe.customers.retrieve(sub.customer as string);
        const email = (customer as Stripe.Customer).email;
        if (email) {
          await supabaseAdmin.from("users").update({
            tier: "free",
            stripe_subscription_status: sub.status,
          }).eq("email", email);
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
