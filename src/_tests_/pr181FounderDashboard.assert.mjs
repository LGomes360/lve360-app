import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const page = read("app/(app)/founder/page.tsx");
const loader = read("src/lib/founderDashboard.ts");
const layout = read("app/(app)/layout.tsx");
const header = read("src/components/DashboardHeader.tsx");
const destination = read("src/lib/authDestination.ts");

assert.match(page, /export const dynamic = "force-dynamic"/);
assert.match(page, /export const revalidate = 0/);
assert.match(page, /supabase\.auth\.getUser\(\)/);
assert.match(page, /isFounderUser\(user\.id\)/);
assert.match(page, /redirect\("\/today"\)/);
assert.match(page, /aggregate product health and never displays member health records/i);
assert.match(page, /href="\/settings\/access-requests"/);

assert.match(loader, /import "server-only"/);
assert.match(loader, /getSupabaseAdmin/);
assert.match(loader, /founder_paid_beta_learning_scorecard/);
assert.match(loader, /reminder_deliveries/);
assert.match(loader, /ai_generation_ledger/);
assert.match(loader, /product_events/);
assert.doesNotMatch(loader, /medications|hormones|supplements|daily_reflections|health_profile/i);

assert.match(layout, /founder=\{founder\}/);
assert.match(header, /founder\?: boolean/);
assert.match(header, /href="\/founder"/);
assert.match(destination, /FOUNDER_HOME = "\/founder"/);

console.log("PR181 founder dashboard assertions passed.");
