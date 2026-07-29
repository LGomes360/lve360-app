import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const entitlementHelper = read("src/lib/serverEntitlements.ts");
assert.match(entitlementHelper, /auth\.getUser\(\)/, "Entitlements must validate the server-side user.");
assert.match(entitlementHelper, /tier === "premium" \|\| tier === "trial"/, "Premium and trial must be paid tiers.");
assert.match(entitlementHelper, /stackContainsPremiumPayload/, "Premium report payloads need a shared classifier.");
assert.match(entitlementHelper, /entitlement\.user\.id !== stack\.user_id/, "Premium reports must be owner-bound.");

const appLayout = read("app/(app)/layout.tsx");
assert.match(appLayout, /getUserAndTier\(\)/, "The authenticated app shell must validate the current user on the server.");
assert.match(appLayout, /if \(!user\) redirect\("\/login"\)/, "The authenticated app shell must reject logged-out visitors.");

const premiumResultsLayout = read("app/(app)/results/premium/layout.tsx");
assert.match(
  premiumResultsLayout,
  /requireTier\(\["premium", "trial"\]/,
  "The legacy premium results route must be server-gated."
);

const dashboardHeader = read("src/components/DashboardHeader.tsx");
assert.match(dashboardHeader, /tier === "premium" \|\| tier === "trial"/, "Paid navigation must use the shared tier boundary.");
assert.match(dashboardHeader, /item\.href === "\/blueprints" \|\| item\.href === "\/settings"/, "Free navigation must hide paid dashboard destinations.");
assert.match(dashboardHeader, /Join LVE360/, "Free accounts need a clear membership path instead of paid navigation.");

const tierRoute = read("app/api/users/tier/route.ts");
assert.match(tierRoute, /getRequestEntitlement/, "Tier lookup must derive identity from the signed-in request.");
assert.doesNotMatch(tierRoute, /searchParams|getSession|supabaseAdmin/, "Tier lookup must not accept arbitrary user IDs.");

const paidApiRoutes = [
  "app/api/ai-insights/route.ts",
  "app/api/fullscript/search/route.ts",
  "app/api/fullscript/add/route.ts",
  "app/api/stacks/combined/route.ts",
  "app/api/stacks/update/route.ts",
  "app/api/stack-items/activate/route.ts",
  "app/api/intake/set/route.ts",
  "app/api/intake/status/route.ts",
  "app/api/logs/route.ts",
  "app/api/goals/route.ts",
  "app/api/goals/upsert/route.ts",
  "app/api/stacks/route.ts",
  "app/api/tally-last/route.ts",
  "app/api/blueprints/[stackId]/supplements/route.ts",
  "app/api/blueprints/[stackId]/refresh/route.ts",
];

for (const path of paidApiRoutes) {
  assert.match(read(path), /requirePaidApi/, `${path} must enforce paid access on the server.`);
}

for (const path of [
  "app/api/get-stack/route.ts",
  "app/api/export-pdf/route.ts",
  "app/api/stack-items/route.ts",
]) {
  assert.match(
    read(path),
    /authorizeStackPayload/,
    `${path} must prevent non-owners from reading premium-generated report data.`
  );
}

const getStack = read("app/api/get-stack/route.ts");
assert.doesNotMatch(
  getStack,
  /user_email, safety_status|tokens_used|prompt_tokens|completion_tokens|total_monthly_cost/,
  "The public free-Blueprint response must not expose identity or operational metadata."
);

const generateStack = read("app/api/generate-stack/route.ts");
assert.match(generateStack, /entitlement\.user\.id !== submission\.user_id/, "Premium generation must be owner-bound.");
assert.match(generateStack, /isPaidTier\(tier\)/, "Premium generation must use the shared paid-tier policy.");

const stripeConfirm = read("app/api/stripe/confirm/route.ts");
assert.match(stripeConfirm, /auth\.getUser\(\)/, "Checkout confirmation must require the signed-in purchaser.");
assert.match(stripeConfirm, /targetUserId !== authUser\.id/, "Checkout confirmation must reject session-owner mismatches.");

for (const path of [
  "app/api/test-stack/route.ts",
  "app/api/test-health/route.ts",
  "app/api/models-healthcheck/route.ts",
  "app/api/env-check/route.ts",
  "app/api/debug/session/route.ts",
]) {
  assert.match(read(path), /NODE_ENV === "production"/, `${path} must be unavailable in production.`);
}

console.log("Premium gating assertions passed.");
