import assert from "node:assert/strict";

import { createInvitationToken, hashInvitationToken, isInvitationToken, maskInvitationEmail } from "../lib/invitationTokens.ts";

const first = createInvitationToken();
const second = createInvitationToken();
assert.equal(first.length, 43);
assert.equal(isInvitationToken(first), true);
assert.notEqual(first, second);
assert.match(hashInvitationToken(first), /^[0-9a-f]{64}$/);
assert.equal(hashInvitationToken(first), hashInvitationToken(first));
assert.equal(isInvitationToken("too-short"), false);
assert.equal(maskInvitationEmail("person@example.com"), "pe••••@example.com");

console.log("PR166 invitation token assertions passed.");
