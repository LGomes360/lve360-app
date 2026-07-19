import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");
const redirects = await nextConfig.redirects();

assert.equal(redirects.length, 2, "both legacy hosts must redirect");

assert.deepEqual(
  redirects.map((rule) => rule.has[0].value).sort(),
  ["lve360.com", "www.lve360.com"],
  "redirect rules must cover the root and www hosts",
);

for (const rule of redirects) {
  assert.equal(rule.source, "/:path*", "redirects must preserve every path");
  assert.equal(
    rule.destination,
    "https://app.lve360.com/:path*",
    "redirects must target the canonical app host",
  );
  assert.equal(rule.permanent, true, "canonical redirects must be permanent");
}

assert.equal(
  redirects.some((rule) => rule.has[0].value === "app.lve360.com"),
  false,
  "the canonical host must never redirect",
);

console.log("canonical host assertions passed");
