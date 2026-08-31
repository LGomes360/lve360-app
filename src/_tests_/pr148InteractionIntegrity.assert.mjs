import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const today = read("src/components/dashboard/TodayExperience.tsx");
const review = read("src/components/review/WeeklyReviewClient.tsx");
const settings = read("app/(app)/settings/page.tsx");
const doses = read("app/api/routine/doses/route.ts");
const todayRoute = read("app/api/today/route.ts");
const reviewRoute = read("app/api/weekly-review/route.ts");
const gateway = read("src/lib/ai/gateway.ts");
const modelHealth = read("app/api/models-healthcheck/route.ts");
const openai = read("src/lib/openai.ts");

assert.match(today, /Reload progress/);
assert.match(today, /saved progress is unchanged/i);
assert.match(review, /Try loading again/);
assert.match(review, /saved week is unchanged/i);
assert.match(settings, /setLoading\(true\)/);
assert.match(settings, /Try again/);

assert.match(doses, /onConflict: "user_id,regimen_item_id,scheduled_date,slot_key"/);
assert.match(todayRoute, /onConflict: "user_id,experiment_id,completion_date"/);
assert.match(reviewRoute, /onConflict: "experiment_id"/);
assert.match(gateway, /estimatedCostUsd\(modelUsed, response\.usage\)/);
assert.match(modelHealth, /process\.env\.VERCEL_ENV/);
assert.match(modelHealth, /vercelEnvironment === "production"/);
assert.match(modelHealth, /maxTokens: 256/);
assert.match(modelHealth, /available_latest_models/);
assert.match(modelHealth, /\.models\.list\(\)/);
assert.match(openai, /extractResponsesText/);
assert.doesNotMatch(openai, /k\.endsWith\("_text"\)/);

console.log("PR148 interaction integrity assertions passed.");
