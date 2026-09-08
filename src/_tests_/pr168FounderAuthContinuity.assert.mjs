import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const supabaseServer = read("src/lib/supabase.ts");
const founderPage = read("app/(app)/settings/access-requests/page.tsx");
const founderReviewRoute = read("app/api/access-requests/[id]/route.ts");
const invitationIssueRoute = read("app/api/access-requests/[id]/invitation/route.ts");
const invitationRevokeRoute = read("app/api/invitations/[id]/route.ts");
const migration = read("supabase/migrations/20260908025516_pr168_founder_auth_continuity.sql");
const documentation = read("docs/qa/pr168-founder-auth-continuity.md");

assert.match(supabaseServer, /createServerComponentClient\(\{ cookies \}\)/);
assert.match(supabaseServer, /createRouteHandlerClient\(\{ cookies \}\)/);
assert.doesNotMatch(supabaseServer, /createServerClient/);

assert.match(founderPage, /export const dynamic = "force-dynamic"/);
assert.match(founderPage, /export const revalidate = 0/);

for (const protectedSurface of [
  founderPage,
]) {
  assert.match(protectedSurface, /supabaseServer/);
  assert.match(protectedSurface, /auth\.getUser\(\)/);
  assert.match(protectedSurface, /isFounderUser/);
}

for (const protectedRoute of [
  founderReviewRoute,
  invitationIssueRoute,
  invitationRevokeRoute,
]) {
  assert.match(protectedRoute, /supabaseRoute/);
  assert.match(protectedRoute, /auth\.getUser\(\)/);
  assert.match(protectedRoute, /isFounderUser/);
}

assert.match(migration, /create index if not exists access_request_events_actor_id_idx/);
assert.match(migration, /public\.access_request_events\(actor_id\)/);
assert.match(migration, /Rollback:/);

for (const requiredSection of [
  "Observed defect",
  "Repair",
  "Verification",
  "Production migration",
  "Rollback",
]) {
  assert.match(documentation, new RegExp(`## ${requiredSection}`));
}

console.log("PR168 founder-auth continuity assertions passed.");
