import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationDirectory = "supabase/migrations";
const migrations = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
const expectedCanonicalHistory = [
  "20260722013900_paid_activation_onboarding.sql",
  "20260722021322_today_dashboard_v1.sql",
  "20260722021449_lock_down_today_writes.sql",
  "20260722024834_weekly_review_rollover.sql",
  "20260722025236_weekly_review_late_rollover.sql",
  "20260722025321_weekly_review_indexes.sql",
  "20260722032132_product_analytics_funnel.sql",
  "20260722032354_product_analytics_rls_policy.sql",
  "20260726180400_account_preferences.sql",
  "20260726224010_reminder_recovery_loop.sql",
  "20260729035142_interactive_blueprint_versions.sql",
  "20260729210709_grant_authenticated_intake_events_select.sql",
  "20260801173403_canonical_current_regimen.sql",
  "20260801173451_tighten_current_regimen_privileges.sql",
  "20260801173703_server_control_current_regimen_writes.sql",
  "20260801182814_pr74_medication_instruction_authority.sql",
  "20260801195147_pr75_practice_aware_reminders.sql",
  "20260801195256_pr75_reminder_delivery_experiment_index.sql",
  "20260801205745_pr76_flexible_regimen_organizer.sql",
  "20260801212917_pr77_supplement_product_cards.sql",
  "20260802022807_preserve_blueprint_journey_rollover.sql",
  "20260808212539_pr83_safety_acknowledgement.sql",
  "20260808233641_pr85_recommendation_decisions.sql",
  "20260808233754_pr85_tighten_recommendation_decision_privileges.sql",
  "20260809151241_pr85_1_unique_report_recommendation_proposals.sql",
  "20260811021553_pr99_ai_generation_ledger.sql",
  "20260811023525_pr100_ai_today_briefs.sql",
  "20260811034153_pr101_ai_weekly_syntheses.sql",
  "20260812014051_pr104_behavior_aware_reminders.sql",
  "20260812024830_pr105_contextual_coaching.sql",
  "20260812030553_pr105_deterministic_coaching_source.sql",
  "20260814023126_pr107_coaching_diagnostics.sql",
  "20260815140848_safety_provenance_unit_normalization.sql",
  "20260816011404_pr113_practice_connections.sql",
  "20260816023219_pr114_controlled_coach_actions.sql",
  "20260824003355_pr123_member_safety_wording.sql",
  "20260824021603_pr125_weekly_practice_quantity.sql",
  "20260824033047_pr126_daily_intentions.sql",
  "20260825031329_pr130_coach_allowance_adjustments.sql",
  "20260826004608_pr131_paid_beta_learning_scorecard.sql",
  "20260827215843_pr138_repeat_blueprint_snapshots.sql",
  "20260829181806_pr144_security_function_lockdown.sql",
  "20260829183236_pr145_rls_policy_optimization.sql",
  "20260829184707_pr146_foreign_key_indexes.sql",
  "20260831025812_pr149_durable_practices.sql",
  "20260831031512_pr150_practice_reconciliation.sql",
  "20260831040616_pr154_plan_change_ledger.sql",
  "20260831222704_pr155_plan_change_ledger_privilege_hardening.sql",
  "20260901004820_pr159_practice_adaptation.sql",
];

assert.deepEqual(migrations, expectedCanonicalHistory, "Local migration history must exactly match the canonical repository history.");
assert.ok(!migrations.some((name) => name.includes("intake_page_analytics")), "The obsolete, unapplied intake migration must not return.");

const versions = migrations.map((name) => name.split("_")[0]);
const names = migrations.map((name) => name.replace(/^\d+_/, "").replace(/\.sql$/, ""));
assert.equal(new Set(versions).size, versions.length, "Migration versions must be unique.");
assert.equal(new Set(names).size, names.length, "Migration names must be unique.");

for (const testName of fs.readdirSync("src/_tests_").filter((name) => name.endsWith(".mjs"))) {
  const source = fs.readFileSync(path.join("src/_tests_", testName), "utf8");
  for (const match of source.matchAll(/supabase\/migrations\/(\d+_[A-Za-z0-9_]+\.sql)/g)) {
    assert.ok(migrations.includes(match[1]), `${testName} references missing migration ${match[1]}`);
  }
}

console.log("Complete local migration history matches the canonical repository history.");
