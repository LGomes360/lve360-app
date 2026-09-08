import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const home = read("app/page.tsx");
const layout = read("app/layout.js");
const publicChrome = read("src/components/PublicSiteChrome.tsx");
const login = read("app/login/page.tsx");
const middleware = read("middleware.ts");
const checkout = read("app/api/stripe/checkout/route.ts");
const results = read("app/results/page.tsx");
const tallyWebhook = read("app/api/tally-webhook/route.ts");
const requestPage = read("app/request-invitation/page.tsx");
const requestForm = read("app/request-invitation/InvitationRequestForm.tsx");
const healthPrivacy = read("app/consumer-health-data-privacy/page.tsx");
const modeProvider = read("src/components/ProductModeProvider.tsx");

assert.match(layout, /getProductMode\(\)/, "the public shell must resolve configuration on the server");
assert.match(layout, /ProductModeProvider/, "client public surfaces must receive a safe serialized mode");
assert.doesNotMatch(modeProvider, /founderUserId|invitationIssuanceEnabled/, "the client provider must not expose administrative controls");

assert.match(home, /More good years\. More energy in them\./);
assert.match(home, /Health should give you more life, not become your life\./);
assert.match(home, /id="blueprint"/);
assert.match(home, /No payment required\. An invitation is not required\./);
assert.match(home, /The door is intentionally small\./);
assert.match(home, /accessMode === "invite_only"/, "the public pivot must remain dormant until the server mode changes");

assert.match(publicChrome, /Our philosophy/);
assert.match(publicChrome, /Inside LVE360/);
assert.match(publicChrome, /Request an invitation/);
assert.match(publicChrome, /Log in/);
assert.match(layout, /Consumer Health Data Privacy/);

assert.match(middleware, /pathname === "\/pricing"/);
assert.match(middleware, /pathname === "\/upgrade"/);
assert.match(middleware, /request-invitation/);
assert.match(checkout, /billingCheckoutEnabled/);
assert.match(checkout, /status: 404/);

assert.match(login, /shouldCreateUser: publicSignupEnabled/);
assert.match(login, /!inviteOnly/);
assert.match(login, /Request an invitation/);
assert.match(results, /inviteOnly \? "\/request-invitation" : "\/upgrade"/);
assert.match(results, /Request private access/);

assert.doesNotMatch(tallyWebhook, /results\?submission_id=\$\{submissionId\}&email=/, "Blueprint redirects must not put email addresses in URLs");
assert.match(requestPage, /Request an invitation/);
assert.match(requestPage, /free LVE360 Blueprint remains available/);
assert.match(requestForm, /does not create an account or guarantee an invitation/);
assert.match(healthPrivacy, /does not sell consumer health data for money/);
assert.match(healthPrivacy, /free Blueprint and private workspace are separate access experiences/);

for (const source of [layout, publicChrome, login, middleware, checkout, results, modeProvider]) {
  assert.doesNotMatch(source, /NEXT_PUBLIC_LVE360_/, "access and billing controls must never be client environment variables");
}

console.log("PR164 private public-shell architecture assertions passed");
