#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const cwd = process.cwd();
const envFiles = [".env.local", ".env"];

for (const file of envFiles) {
  const fullPath = path.join(cwd, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const requiredForLaunch = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "TALLY_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_PREMIUM",
  "STRIPE_PRICE_ANNUAL",
  "STRIPE_WEBHOOK_SECRET",
];

const recommended = [
  "NEXT_PUBLIC_AMAZON_TAG",
  "OPENAI_MAIN_MODEL",
  "OPENAI_MINI_MODEL",
  "RESEND_API_KEY",
  "REPORT_EMAIL_FROM",
  "FULLSCRIPT_BASE_URL",
  "FULLSCRIPT_API_KEY",
];

const missingRequired = requiredForLaunch.filter((name) => !process.env[name]);
const missingRecommended = recommended.filter((name) => !process.env[name]);

console.log("LVE360 launch environment check");
console.log("================================");
console.log(`Checked env files: ${envFiles.filter((file) => fs.existsSync(path.join(cwd, file))).join(", ") || "none"}`);

if (missingRecommended.length) {
  console.warn(`\nRecommended but missing: ${missingRecommended.join(", ")}`);
}

if (missingRequired.length) {
  console.error(`\nMissing required launch env vars: ${missingRequired.join(", ")}`);
  console.error("\nFix these in your local .env.local and in Vercel Production/Preview environment variables before launch QA.");
  process.exit(1);
}

console.log("\nAll required launch env vars are present.");
