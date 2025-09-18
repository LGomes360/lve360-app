// src/lib/env.ts
/**
 * Environment helpers.
 * - Throws in production runtime (VERCEL=1 or NODE_ENV=production).
 * - In GitHub Actions PR builds, WARN instead of throwing (so forked PRs don't fail).
 */

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_PREMIUM",
] as const;

const optional = [
  "STRIPE_PRICE_PRO",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "OPENAI_API_KEY",
] as const;

function isProductionRuntime() {
  if (process.env.VERCEL === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

function isCiPullRequest() {
  // GitHub Actions PR builds set GITHUB_ACTIONS=true and GITHUB_EVENT_NAME=pull_request
  return process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_EVENT_NAME === "pull_request";
}

export function assertEnv() {
  const missing: string[] = [];
  const missingOptional: string[] = [];

  for (const k of required) {
    if (!process.env[k]) missing.push(k);
  }
  for (const k of optional) {
    if (!process.env[k]) missingOptional.push(k);
  }

  const prod = isProductionRuntime();
  const prOnActions = isCiPullRequest();

  if (missing.length) {
    const msg = `Missing required env vars: ${missing.join(", ")}`;
    if (prod) {
      // In production, we want to fail hard so deployments are correct
      throw new Error(`❌ ${msg}`);
    }
    if (prOnActions) {
      // PR builds: warn so forks/PRs don't fail the build
      console.warn(`⚠️ [env] (PR build) ${msg}`);
    } else {
      // Local dev or other CI: warn
      console.warn(`⚠️ [env] ${msg}`);
    }
  }

  if (missingOptional.length) {
    console.warn(`⚠️ Missing optional env vars: ${missingOptional.join(", ")} (may be required in production)`);
  }
}
