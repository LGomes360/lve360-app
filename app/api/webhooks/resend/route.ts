import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ReminderProviderEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string };
};

const STATUS_BY_EVENT: Record<string, "delivered" | "bounced" | "failed"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.failed": "failed",
};

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  try {
    const payload = await req.text();
    const event = new Webhook(webhookSecret).verify(payload, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as ReminderProviderEvent;

    const status = event.type ? STATUS_BY_EVENT[event.type] : null;
    const providerId = event.data?.email_id;
    if (!status || !providerId) return NextResponse.json({ ok: true, ignored: true });

    const { error } = await getSupabaseAdmin()
      .from("reminder_deliveries")
      .update({
        status,
        provider_event_type: event.type,
        provider_event_at: event.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_id", providerId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[resend-webhook] invalid or failed event", error);
    return NextResponse.json({ ok: false, error: "invalid_webhook" }, { status: 400 });
  }
}
