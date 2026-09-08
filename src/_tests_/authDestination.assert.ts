import assert from "node:assert/strict";
import { authDestination, FOUNDER_HOME } from "../lib/authDestination.ts";

for (const founder of [true, false]) {
  const home = founder ? FOUNDER_HOME : "/today";
  for (const input of ["", "/today", "/unknown", "//evil.test", "/\\evil.test", "https://evil.test", "/\nevil.test", FOUNDER_HOME]) {
    assert.equal(authDestination(input, founder), home, `${founder}: ${JSON.stringify(input)}`);
  }
  assert.equal(authDestination("/settings", founder), "/settings");
  assert.equal(authDestination("/upgrade?plan=annual&next=https://evil.test", founder), "/upgrade?plan=annual");
  assert.equal(authDestination("/upgrade?plan=invalid", founder), "/upgrade");
}
assert.equal(authDestination("/dashboard", true), FOUNDER_HOME);
assert.equal(authDestination("/dashboard", false), "/dashboard");
// Subscription tier deliberately is not an input: an unpaid Founder can reach
// review without turning ordinary unpaid members into premium members.
console.log("Founder and member auth destination regression checks passed.");
