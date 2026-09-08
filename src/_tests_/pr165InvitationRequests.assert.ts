import assert from "node:assert/strict";

import { normalizeInvitationEmail, parseFounderReview, parseInvitationRequest } from "../lib/invitationRequest.ts";

assert.equal(normalizeInvitationEmail("  Person@Example.COM "), "person@example.com");

const valid = parseInvitationRequest({
  firstName: "  Alex  ",
  email: " ALEX@example.com ",
  organizingHelp: "My routines",
  interests: ["Energy", "Energy", "Nutrition", "Not allowed"],
  website: "",
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.data.firstName, "Alex");
  assert.equal(valid.data.email, "alex@example.com");
  assert.deepEqual(valid.data.interests, ["Energy", "Nutrition"]);
}

assert.equal(parseInvitationRequest({ firstName: "Alex", email: "bad", organizingHelp: "Routines" }).ok, false);
assert.equal(parseFounderReview({ status: "waitlisted", notes: "Follow up later" }).ok, true);
assert.equal(parseFounderReview({ status: "approved" }).ok, false);
assert.equal(parseFounderReview({ status: "revoked" }).ok, false);

console.log("PR165 invitation request assertions passed.");
