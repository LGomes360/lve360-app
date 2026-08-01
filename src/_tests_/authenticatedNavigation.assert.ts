import assert from "node:assert/strict";

import {
  AUTHENTICATED_NAV_ITEMS,
  LEGACY_AUTHENTICATED_REDIRECTS,
  isAuthenticatedRouteActive,
} from "../lib/authenticatedNavigation.ts";

assert.deepEqual(
  AUTHENTICATED_NAV_ITEMS.map((item) => item.label),
  ["Today", "Routine", "Journey", "Blueprints", "Settings"]
);
assert.equal(new Set(AUTHENTICATED_NAV_ITEMS.map((item) => item.href)).size, 5);
assert.equal(LEGACY_AUTHENTICATED_REDIRECTS["/dashboard"], "/today");
assert.equal(LEGACY_AUTHENTICATED_REDIRECTS["/dashboard/my-quiz"], "/blueprints");
assert.equal(LEGACY_AUTHENTICATED_REDIRECTS["/quiz/premium"], "/blueprints");
assert.equal(LEGACY_AUTHENTICATED_REDIRECTS["/account"], "/settings");
assert.equal(isAuthenticatedRouteActive("/today", "/today"), true);
assert.equal(isAuthenticatedRouteActive("/routine", "/routine"), true);
assert.equal(isAuthenticatedRouteActive("/blueprints/archive", "/blueprints"), true);
assert.equal(isAuthenticatedRouteActive("/journey", "/today"), false);

console.log("authenticated navigation assertions passed");
