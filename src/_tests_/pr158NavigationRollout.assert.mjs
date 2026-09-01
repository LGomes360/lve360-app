import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [navigation, header, plan] = await Promise.all([
  readFile("src/lib/authenticatedNavigation.ts", "utf8"),
  readFile("src/components/DashboardHeader.tsx", "utf8"),
  readFile("app/(app)/plan/page.tsx", "utf8"),
]);

assert.match(
  navigation,
  /PAID_PRIMARY_NAV_ITEMS[\s\S]*\/today[\s\S]*\/plan[\s\S]*\/journey/,
  "Paid primary navigation must follow the Today, Plan, Journey product loop.",
);
assert.match(
  navigation,
  /PAID_SECONDARY_NAV_ITEMS[\s\S]*\/routine[\s\S]*Blueprint archive[\s\S]*\/settings/,
  "Routine, Blueprint archive, and Settings must remain available as secondary destinations.",
);
assert.match(header, /PAID_PRIMARY_NAV_ITEMS/, "The member header must use the paid primary hierarchy.");
assert.match(header, /Member tools and archive/, "Desktop secondary navigation must be named for assistive technology.");
assert.match(header, /Tools and archive/, "Mobile navigation must distinguish secondary tools from primary destinations.");
assert.match(header, /AskLve360Coach/, "Ask LVE360 must remain globally available for paid members.");
assert.match(
  header,
  /item\.href === "\/blueprints" \|\| item\.href === "\/settings"/,
  "Free members must retain direct Blueprint and Settings navigation.",
);
assert.match(header, /aria-expanded=\{secondaryOpen\}/, "The secondary desktop menu must expose its state.");
assert.match(header, /event\.key === "Escape"/, "The secondary desktop menu must close with Escape.");
assert.match(header, /secondaryMenuButtonRef\.current\?\.focus\(\)/, "Escape must return focus to the secondary menu trigger.");
assert.match(plan, /requireTier\(\["premium", "trial"\]/, "The new primary Plan destination must remain paid-gated.");

console.log("PR158 navigation rollout assertions passed.");
