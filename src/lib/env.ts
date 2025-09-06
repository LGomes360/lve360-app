// src/lib/env.ts

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_PREMIUM',
  // 'SUPABASE_SERVICE_ROLE', // uncomment if/when used
  // 'STRIPE_WEBHOOK_SECRET', // required in prod & when webhooks are enabled in preview
] as const;

export function assertEnv() {
  const missing: string[] = [];
  for (const k of required) {
    if (!process.env[k]) {
      missing.push(k);
    }
  }
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
}
