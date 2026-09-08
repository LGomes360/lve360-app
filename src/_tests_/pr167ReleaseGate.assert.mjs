import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const publicRequestRoute = read("app/api/access-requests/route.ts");
const founderReviewRoute = read("app/api/access-requests/[id]/route.ts");
const invitationRoute = read("app/api/access-requests/[id]/invitation/route.ts");
const callbackRoute = read("app/auth/callback/route.ts");
const exportRoute = read("app/api/account/export/route.ts");
const deletionRoute = read("app/api/account/delete/route.ts");
const productMode = read("src/lib/productModeConfig.ts");
const migration = read("supabase/migrations/20260908013842_pr167_private_membership_release_hardening.sql");
const documentation = read("docs/qa/private-membership-release-gate.md");

assert.match(publicRequestRoute, /consume_invitation_request_rate_limit/);
assert.match(publicRequestRoute, /status:\s*429/);
assert.match(publicRequestRoute, /Retry-After/);
assert.match(publicRequestRoute, /ignoreDuplicates:\s*true/);
assert.match(founderReviewRoute, /isFounderUser/);
assert.match(invitationRoute, /isFounderUser/);
assert.match(invitationRoute, /invitationsOperationallyUnlocked/);
assert.match(callbackRoute, /accept_private_invitation/);
assert.match(callbackRoute, /record_private_invitation_rejection/);
assert.match(callbackRoute, /user\.email\.toLowerCase\(\)/);
assert.match(productMode, /!inviteOnly.*LVE360_PUBLIC_SIGNUP_ENABLED/s);
assert.match(productMode, /!inviteOnly.*LVE360_BILLING_CHECKOUT_ENABLED/s);

assert.match(migration, /private\.invitation_request_rate_limits/);
assert.match(migration, /request_hash text primary key/);
assert.match(migration, /revoke execute on function public\.consume_invitation_request_rate_limit[\s\S]*from public, anon, authenticated, service_role/);
assert.match(migration, /grant execute on function public\.consume_invitation_request_rate_limit[\s\S]*to service_role/);
assert.match(migration, /create table if not exists public\.access_request_events/);
assert.match(migration, /grant select, insert on table public\.access_request_events to service_role/);
assert.doesNotMatch(migration, /grant (?:select|insert|update|delete)[^;]+access_request_events[^;]+to (?:anon|authenticated)/i);
assert.match(migration, /status in \('submitted', 'reviewing', 'approved', 'declined', 'withdrawn'\)/);
assert.match(migration, /invitation_request_status_guard/);
assert.match(migration, /delete_invitation_request_data/);
assert.match(migration, /record_private_invitation_rejection/);

assert.match(exportRoute, /access_request_invitations/);
assert.match(exportRoute, /access_request_events/);
assert.doesNotMatch(exportRoute, /token_hash/);
assert.match(deletionRoute, /delete_invitation_request_data/);

for (const requiredSection of [
  "Automated evidence",
  "Preview rehearsal",
  "Production cutover",
  "Rollback",
  "Founder decision",
]) {
  assert.match(documentation, new RegExp(`## ${requiredSection}`));
}
assert.match(documentation, /Production remains unchanged/);

console.log("PR167 private-membership release-gate assertions passed.");
