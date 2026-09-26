import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const today = readFileSync("app/(app)/today/TodayClient.tsx", "utf8");
const card = readFileSync("src/components/dashboard/ConnectedHealthCard.tsx", "utf8");
const healthPicture = readFileSync("src/lib/healthPicture.ts", "utf8");
const settings = readFileSync("app/(app)/settings/page.tsx", "utf8");
const settingsCard = readFileSync("src/components/settings/HealthContextCard.tsx", "utf8");
const contract = readFileSync("docs/chatgpt-health-handoff.md", "utf8");

assert.ok(today.indexOf("<DailyLog") < today.indexOf("<ConnectedHealthCard"), "Today must listen before presenting the health picture");
assert.match(today, /decisionReady \? \(/, "the health picture must wait for a check-in or explicit skip");
assert.doesNotMatch(card, /if \(.*\) return null;/, "the health picture must remain visible when context is missing");
for (const label of ["Sleep", "Exercise", "Diet & weight", "Overall feeling", "Lab balance"]) {
  assert.match(healthPicture, new RegExp(label.replace("&", "&amp;|&")), `Today must include ${label}`);
  assert.match(settingsCard, new RegExp(label.replace("&", "&amp;|&")), `Settings must explain ${label}`);
}
assert.match(healthPicture, /check-in stays the source of truth/i);
assert.match(healthPicture, /never overrides how you say you feel/i);
assert.match(healthPicture, /source laboratory’s reference ranges/i);
assert.match(healthPicture, /context, not a diagnosis/i);
assert.match(settings, /<HealthContextCard/);
assert.match(settingsCard, /No approved handoff is saved yet/i, "the UI must distinguish an empty account from a completed handoff");
assert.match(contract, /authenticated MCP/i);
assert.match(contract, /member_approved/);
assert.match(contract, /must reject raw records/i);

console.log("PR186 ChatGPT Health handoff architecture assertions passed.");
