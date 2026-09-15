import { Webhook } from "svix";

import { withReminderOperationRetry } from "./reminderReliability.ts";

export type ReminderProviderEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    tags?: Record<string, string>;
  };
};

export type ReminderProviderUpdate = {
  providerId: string;
  status: "delivered" | "bounced" | "failed";
  eventType: string;
  eventAt: string;
  deliveryId?: string;
};

const STATUS_BY_EVENT: Record<string, ReminderProviderUpdate["status"]> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.failed": "failed",
};

export function verifyReminderProviderEvent(
  secret: string,
  payload: string,
  headers: Record<string, string>,
): ReminderProviderEvent {
  return new Webhook(secret).verify(payload, headers) as ReminderProviderEvent;
}

export function normalizeReminderProviderEvent(
  event: ReminderProviderEvent,
  now = new Date(),
): ReminderProviderUpdate | null {
  const eventType = event.type;
  const providerId = event.data?.email_id;
  const status = eventType ? STATUS_BY_EVENT[eventType] : null;
  if (!eventType || !providerId || !status) return null;
  return {
    providerId,
    status,
    eventType,
    eventAt: event.created_at ?? now.toISOString(),
    deliveryId: event.data?.tags?.lve360_delivery_id,
  };
}

export async function applyReminderProviderEvent(
  event: ReminderProviderEvent,
  persist: (update: ReminderProviderUpdate) => PromiseLike<{
    data: unknown;
    error: unknown | null;
    updated: boolean;
  }>,
): Promise<"updated" | "ignored"> {
  const update = normalizeReminderProviderEvent(event);
  if (!update) return "ignored";
  const result = await withReminderOperationRetry(() => persist(update));
  if (result.error) throw result.error;
  return result.updated ? "updated" : "ignored";
}
