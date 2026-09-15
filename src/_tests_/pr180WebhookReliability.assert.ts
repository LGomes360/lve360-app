import assert from "node:assert/strict";
import { Webhook } from "svix";

import {
  applyReminderProviderEvent,
  normalizeReminderProviderEvent,
  verifyReminderProviderEvent,
} from "../lib/reminderWebhook.ts";

const secret = `whsec_${Buffer.from("pr180-test-signing-secret-value").toString("base64")}`;
const messageId = "msg_pr180_test";
const timestamp = new Date();
const event = {
  type: "email.delivered",
  created_at: "2026-09-14T10:00:00.000Z",
  data: {
    email_id: "email_pr180_test",
    tags: { lve360_delivery_id: "delivery_pr180_test" },
  },
};
const payload = JSON.stringify(event);
const signature = new Webhook(secret).sign(messageId, timestamp, payload);
const verified = verifyReminderProviderEvent(secret, payload, {
  "svix-id": messageId,
  "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
  "svix-signature": signature,
});
assert.equal(verified.type, "email.delivered");
assert.equal(normalizeReminderProviderEvent(event)?.deliveryId, "delivery_pr180_test");
assert.throws(() => verifyReminderProviderEvent(secret, payload, {
  "svix-id": messageId,
  "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
  "svix-signature": "v1,invalid",
}));
assert.equal(normalizeReminderProviderEvent({ type: "email.opened", data: { email_id: "email" } }), null);

let attempts = 0;
const rows = new Map<string, string>();
const persist = async (update: { providerId: string; status: string }) => {
  attempts += 1;
  if (attempts === 1) return { data: null, error: { code: "temporary" }, updated: false };
  rows.set(update.providerId, update.status);
  return { data: [{ id: "delivery" }], error: null, updated: true };
};
assert.equal(await applyReminderProviderEvent(event, persist), "updated");
assert.equal(attempts, 2, "A transient callback write must be retried.");
assert.equal(await applyReminderProviderEvent(event, persist), "updated");
assert.deepEqual([...rows.entries()], [["email_pr180_test", "delivered"]]);

console.log("PR180 webhook reliability assertions passed.");
