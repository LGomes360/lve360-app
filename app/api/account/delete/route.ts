import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const cancellableStatuses = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

function uniqueIds(rows: Array<{ id: string }> | null | undefined) {
  return [...new Set((rows ?? []).map((row) => row.id))];
}

export async function DELETE(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.confirmation !== "string" || body.confirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ ok: false, error: "account_unavailable" }, { status: 500 });
  }

  try {
    if (profile?.stripe_customer_id) {
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) {
        return NextResponse.json({ ok: false, error: "billing_unavailable" }, { status: 503 });
      }
      const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
        limit: 100,
      });
      await Promise.all(
        subscriptions.data
          .filter((subscription) => cancellableStatuses.has(subscription.status))
          .map((subscription) => stripe.subscriptions.cancel(subscription.id))
      );
    }

    const [
      { data: submissionsByUser, error: submissionsByUserError },
      { data: submissionsByEmail, error: submissionsByEmailError },
      { data: stacksByUser, error: stacksByUserError },
      { data: stacksByEmail, error: stacksByEmailError },
    ] =
      await Promise.all([
        admin.from("submissions").select("id").eq("user_id", user.id),
        admin.from("submissions").select("id").eq("user_email", user.email),
        admin.from("stacks").select("id").eq("user_id", user.id),
        admin.from("stacks").select("id").eq("user_email", user.email),
      ]);
    const lookupError = submissionsByUserError ?? submissionsByEmailError ?? stacksByUserError ?? stacksByEmailError;
    if (lookupError) throw lookupError;
    const submissionIds = uniqueIds([...(submissionsByUser ?? []), ...(submissionsByEmail ?? [])]);
    const stackIds = uniqueIds([...(stacksByUser ?? []), ...(stacksByEmail ?? [])]);

    if (submissionIds.length) {
      const { error } = await admin.from("link_clicks").delete().in("submission_id", submissionIds);
      if (error) throw error;
    }
    if (stackIds.length) {
      const { error } = await admin.from("link_clicks").delete().in("stack_id", stackIds);
      if (error) throw error;
    }

    const { error: eventsError } = await admin.from("product_events").delete().eq("user_id", user.id);
    if (eventsError) throw eventsError;

    const { error: ownedStacksError } = await admin.from("stacks").delete().eq("user_id", user.id);
    if (ownedStacksError) throw ownedStacksError;
    const { error: emailStacksError } = await admin.from("stacks").delete().eq("user_email", user.email);
    if (emailStacksError) throw emailStacksError;
    const { error: ownedSubmissionsError } = await admin.from("submissions").delete().eq("user_id", user.id);
    if (ownedSubmissionsError) throw ownedSubmissionsError;
    const { error: emailSubmissionsError } = await admin.from("submissions").delete().eq("user_email", user.email);
    if (emailSubmissionsError) throw emailSubmissionsError;

    const { error: publicUserError } = await admin.from("users").delete().eq("id", user.id);
    if (publicUserError) throw publicUserError;

    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) throw authError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[account-delete] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "deletion_unavailable" }, { status: 500 });
  }
}
