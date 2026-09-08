import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const publicRoute = read("app/api/access-requests/route.ts");
const founderRoute = read("app/api/access-requests/[id]/route.ts");
const requestForm = read("app/request-invitation/InvitationRequestForm.tsx");
const founderPage = read("app/(app)/settings/access-requests/page.tsx");
const migration = read("supabase/migrations/20260907234200_pr165_invitation_requests.sql");

assert.match(publicRoute, /ignoreDuplicates:\s*true/);
assert.match(publicRoute, /status:\s*202/);
assert.doesNotMatch(publicRoute, /\.select\(/);
assert.match(founderRoute, /isFounderUser/);
assert.match(founderRoute, /parseFounderReview/);
assert.match(requestForm, /do not include diagnoses, medication details, lab results/);
assert.match(founderPage, /invitationsOperationallyUnlocked/);
assert.match(migration, /force row level security/i);
assert.match(migration, /revoke all on table public\.access_requests from public, anon, authenticated, service_role/i);
assert.match(migration, /grant select, insert, update on table public\.access_requests to service_role/i);
assert.doesNotMatch(migration, /create policy/i);
assert.doesNotMatch(migration, /token_hash/i);
assert.doesNotMatch(migration, /create table (if not exists )?public\.invitations/i);

console.log("PR165 architecture assertions passed.");
