import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const typesSource = fs.readFileSync(path.join(root, "src/lib/productAnalyticsTypes.ts"), "utf8");
const analyticsRoute = fs.readFileSync(path.join(root, "app/api/analytics/event/route.ts"), "utf8");
const loginPage = fs.readFileSync(path.join(root, "app/login/page.tsx"), "utf8");
const migrationsDirectory = path.join(root, "supabase/migrations");

const applicationNames = extractTypescriptArray(typesSource, "PRODUCT_EVENT_NAMES");
const applicationSources = extractTypescriptArray(typesSource, "PRODUCT_EVENT_SOURCES");
const databaseNames = latestConstraintValues(migrationsDirectory, "product_events_name", "event_name");
const databaseSources = latestConstraintValues(migrationsDirectory, "product_events_source", "source");

assert.deepEqual(databaseNames, applicationNames, "The database event-name constraint must match PRODUCT_EVENT_NAMES exactly.");
assert.deepEqual(databaseSources, applicationSources, "The database source constraint must match PRODUCT_EVENT_SOURCES exactly.");
assert.ok(databaseNames.includes("login_started"), "The login_started event must be accepted by the database.");
assert.ok(databaseSources.includes("login"), "The login source must be accepted by the database.");
assert.match(analyticsRoute, /"login_started"/, "The client analytics endpoint must permit login_started.");
assert.match(loginPage, /event_name:\s*"login_started",\s*source:\s*"login"/, "The login page must emit the validated event and source pair.");

console.log("PR178 product analytics contract assertions passed.");

function extractTypescriptArray(source, constantName) {
  const match = source.match(new RegExp(`export const ${constantName} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `Could not find ${constantName}.`);
  return quotedValues(match[1]).sort();
}

function latestConstraintValues(directory, constraintName, columnName) {
  const pattern = new RegExp(
    `add constraint ${constraintName} check \\(${columnName} in \\(([\\s\\S]*?)\\)\\);`,
    "gi",
  );
  let latest = null;
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(directory, file), "utf8");
    for (const match of sql.matchAll(pattern)) latest = quotedValues(match[1]).sort();
  }
  assert.ok(latest, `Could not find the latest ${constraintName} definition.`);
  return latest;
}

function quotedValues(source) {
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}
