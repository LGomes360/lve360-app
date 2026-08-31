import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const route = read("app/api/today-brief/route.ts");
const data = read("src/lib/ai/todayBriefData.ts");
const component = read("src/components/dashboard/AiTodayBrief.tsx");
const modelConfig = read("src/lib/ai/modelConfig.ts");
const migration = read("supabase/migrations/20260811023525_pr100_ai_today_briefs.sql");
const login = read("app/login/page.tsx");

assert.match(modelConfig, /today_brief:[\s\S]*capability: "mini"/, "The daily brief must use the cost-conscious task router.");
assert.match(data, /contextHash/, "The brief must be cached by meaningful context.");
assert.match(data, /code === "23505"/, "Concurrent page loads must not create duplicate model calls.");
assert.match(data, /generation_status: "failed"/, "AI failure must preserve a deterministic fallback.");
assert.match(route, /premium_required/, "The Today Brief must remain a paid experience.");
assert.match(route, /remind_later/, "The member must be able to quiet the brief temporarily.");
assert.doesNotMatch(component, /Mark complete/, "The brief must not duplicate the focused-practice completion action.");
assert.doesNotMatch(component, /Open Routine/, "The brief must not duplicate Today or Routine navigation.");
assert.match(component, /Why this matters/, "The brief must preserve contextual explanation.");
assert.doesNotMatch(component, /\/api\/stacks\/combined/, "The brief must not duplicate the Routine checklist.");
assert.match(migration, /unique \(user_id, local_date, context_hash\)/, "The database must enforce one brief per context.");
assert.match(migration, /revoke all on table public\.ai_today_briefs from public, anon, authenticated/, "Brief storage must remain server-mediated.");
assert.match(migration, /Rollback notes:/, "The schema change needs an explicit rollback path.");
assert.match(login, /typeof window !== "undefined"[\s\S]*window\.location\.origin[\s\S]*NEXT_PUBLIC_APP_URL/, "Preview auth must return to the origin that initiated the PKCE flow.");

console.log("PR100 Today Brief page and storage assertions passed");
