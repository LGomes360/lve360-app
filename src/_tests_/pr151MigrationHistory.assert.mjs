import assert from "node:assert/strict";
import fs from "node:fs";

const migrationFiles = fs.readdirSync("supabase/migrations");

assert.ok(migrationFiles.includes("20260831025812_pr149_durable_practices.sql"));
assert.ok(migrationFiles.includes("20260831031512_pr150_practice_reconciliation.sql"));
assert.ok(!migrationFiles.includes("20260831023801_pr149_durable_practices.sql"));
assert.ok(!migrationFiles.includes("20260831030031_pr150_practice_reconciliation.sql"));

const versions = migrationFiles.map((name) => name.split("_")[0]);
assert.equal(new Set(versions).size, versions.length, "Migration versions must remain unique.");

console.log("PR151 local migration history matches production versions.");
