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
      return NextResponse.json(
        { error: "Webhook signature verification failed", details: String(err?.message ?? err) },
        { status: 400 }
      );
    }

    // Deduplicate events
    const eventId = event.id;
    const { data: existing } = await supabaseAdmin
      .from("stripe_events")
      .select("id")
      .eq("id", eventId)
      .single();

    if (existing) return NextResponse.json({ received: true, deduped: true }, { status: 200 });

    await supabaseAdmin
      .from("stripe_events")
      .insert([{ id: eventId, raw: event, created_at: new Date().toISOString() }]);

    // ---- Handle checkout success ----
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_details?.email ?? session.metadata?.email ?? null;

      if (email) {
        // 1. Ensure auth.users exists
        const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserByEmail(email);

        let authId = authUser?.user?.id ?? null;
        if (!authId && !authErr) {
          // No auth record yet → create one
          const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
          });
          if (createErr) console.error("Failed to create auth.user:", createErr.message);
          authId = newUser?.user?.id ?? null;
        }

        // 2. Upsert into your users table, tying to authId
        if (authId) {
          await supabaseAdmin.from("users").upsert(
            { id: authId, email, tier: "premium" },
            { onConflict: "id" }
          );
        } else {
          console.warn("No authId found/created for email:", email);
        }
      }

      // 3. Persist subscription details
      if (session.subscription) {
        const subscriptionId = session.subscription as string;
        await supabaseAdmin.from("subscriptions").upsert({
          id: subscriptionId,
          customer: session.customer,
          price: session.metadata?.price_id ?? null,
          status: "active",
          raw: session,
        });
      }
    }

    // ---- Handle subscription lifecycle updates ----
    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      await supabaseAdmin.from("subscriptions").upsert({
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        raw: sub,
      });

      // Optional: downgrade user on cancellation
      if (sub.status === "canceled") {
        const customerId = sub.customer as string;
        // look up email from customer if you need
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
