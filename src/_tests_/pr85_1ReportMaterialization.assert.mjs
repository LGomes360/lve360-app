import assert from "node:assert/strict";
import fs from "node:fs";

const helper = fs.readFileSync("src/lib/reportRecommendationProposals.ts", "utf8");
const decisionData = fs.readFileSync("src/lib/recommendationDecisionData.ts", "utf8");
const blueprintPage = fs.readFileSync("app/(app)/blueprints/[stackId]/page.tsx", "utf8");
const routineData = fs.readFileSync("src/lib/routineData.ts", "utf8");
const currentContext = fs.readFileSync("src/lib/currentBlueprintContext.ts", "utf8");
const today = fs.readFileSync("src/components/dashboard/TodayExperience.tsx", "utf8");
const generator = fs.readFileSync("src/lib/generateStack.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260809151241_pr85_1_unique_report_recommendation_proposals.sql", "utf8");

assert.match(helper, /parseMarkdownToItems\(reportMarkdown\)/, "The dated report must be the source for missing proposals.");
assert.match(helper, /ACTIONABLE_REPORT_STATUS/, "Only an explicit actionable report status may be materialized.");
assert.match(helper, /item\.is_current === false/, "Current regimen entries must never become proposals.");
assert.match(helper, /!currentNames\.has/, "A report idea already in the regimen must not be duplicated.");
assert.match(decisionData, /extractReportRecommendationProposals/, "Decision loading must repair missing report-only proposals.");
assert.match(decisionData, /insertError\.code !== "23505"/, "Concurrent materialization must resolve safely.");
assert.match(decisionData, /refreshed/, "The materialized database row must be reloaded before decisions are created.");
assert.match(blueprintPage, /report\.canonicalMarkdown/, "Blueprint loading must provide the canonical report text.");
assert.match(routineData, /report\.canonicalMarkdown/, "Routine loading must see the same report-only ideas.");
assert.match(currentContext, /actionable_recommendation_count/, "Today must know whether its action link has a live target.");
assert.match(today, /"recommendation-decisions" : "recommendation-report"/, "Today must never link to an absent decision panel.");
assert.match(generator, /extractReportRecommendationProposals/, "Future Blueprint generation must persist report-only proposals.");
assert.match(migration, /unique index[\s\S]*stack_id, lower\(btrim\(name\)\)[\s\S]*where is_current = false/i);
assert.match(migration, /Rollback:/, "The schema change must document rollback.");

console.log("PR85.1 report materialization assertions passed.");
