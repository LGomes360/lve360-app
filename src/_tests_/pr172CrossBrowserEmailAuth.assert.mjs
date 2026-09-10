import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const callback = read("app/auth/callback/route.ts");
const login = read("app/login/page.tsx");
const invitationClaim = read("app/invite/[token]/InvitationClaim.tsx");
const template = read("supabase/templates/magic-link.html");
const runbook = read("docs/private-invitation-operations.md");

assert.match(callback, /searchParams\.get\("token_hash"\)/);
assert.match(callback, /verifyOtp\(\{ token_hash: tokenHash, type: "email" \}\)/);
assert.match(callback, /exchangeCodeForSession\(code!\)/);
assert.match(callback, /searchParams\.get\("invite"\)/);
assert.match(callback, /accept_private_invitation/);
assert.match(template, /\{\{ \.RedirectTo \}\}/);
assert.match(template, /\{\{ \.TokenHash \}\}/);
assert.match(template, /type=email/);
assert.doesNotMatch(template, /ConfirmationURL/);
assert.match(login, /searchParams\.set\("next", nextPath\)/);
assert.match(login, /searchParams\?\.get\("error"\)/);
assert.match(invitationClaim, /url\.searchParams\.set\("next", "\/today"\)/);
assert.match(invitationClaim, /url\.searchParams\.set\("invite", token\)/);
assert.match(login, /any browser/);
assert.match(invitationClaim, /any browser/);
assert.match(runbook, /Do not apply the template before the PR172 application deployment is live/);
assert.match(runbook, /continues to support PKCE `code` exchanges/);

console.log("PR172 cross-browser email authentication assertions passed.");
