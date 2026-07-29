import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const layout = read("app/layout.js");
const pricing = read("app/pricing/page.tsx");
const upgrade = read("app/upgrade/UpgradeClient.tsx");
const intake = read("src/components/intake/IntakeEmbed.tsx");
const terms = read("app/terms/page.tsx");
const privacy = read("app/privacy/page.tsx");
const disclaimer = read("app/medical-disclaimer/page.tsx");
const contact = read("app/contact/page.tsx");

for (const href of ["/terms", "/privacy", "/medical-disclaimer", "/contact"]) {
  assert.match(layout, new RegExp(`href=["']${href}["']`), `Footer must link to ${href}`);
}

for (const surface of [pricing, upgrade, intake]) {
  assert.match(surface, /\/terms/, "Conversion and intake surfaces must link to the Terms");
  assert.match(surface, /\/privacy/, "Conversion and intake surfaces must link to the Privacy Policy");
  assert.match(surface, /\/medical-disclaimer/, "Conversion and intake surfaces must link to the Medical Disclaimer");
}

assert.match(terms, /renew automatically/i, "Terms must explain subscription renewal");
assert.match(terms, /billing portal/i, "Terms must explain how to cancel future renewals");
assert.match(privacy, /does not sell your health information/i, "Privacy must state the health-data sale policy");
assert.match(privacy, /download[\s\S]*permanently delete your account/i, "Privacy must explain account controls");
assert.match(disclaimer, /does not diagnose, treat, cure, prevent/i, "Disclaimer must describe the medical boundary");
assert.match(disclaimer, /no material concern was identified/i, "Disclaimer must reject absolute safety conclusions");
assert.match(contact, /support@lve360\.com/, "Contact page must provide the support address");
assert.match(contact, /Medical emergencies/i, "Contact page must distinguish emergency needs");

console.log("legal and compliance assertions passed");
