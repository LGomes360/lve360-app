# LVE360 Agent Operating Guide

This repo powers LVE360, an evidence-first AI wellness and supplement stack platform.

## Product goal

The launch funnel must reliably support:

1. Home / marketing page
2. Quiz intake
3. Free Blueprint report
4. Upgrade to paid plan
5. Stripe Checkout
6. Premium Agent Dashboard
7. PDF export and billing/account management

LVE360 provides educational wellness support only. It must not diagnose, treat, cure, or prevent disease.

## Tech assumptions

- Framework: Next.js 14 / React 18 / TypeScript
- Deployment: Vercel
- Database/auth: Supabase
- Payments: Stripe subscriptions
- AI: OpenAI-backed stack/report generation
- Email: Resend when enabled
- Reporting: Markdown report persisted in Supabase, PDF export available

## Safety and compliance rules

- Do not use medical-claim language such as diagnose, treat, cure, or prevent.
- Prefer phrasing like supports, may help, research suggests, consider, discuss with your clinician.
- Preserve DSHEA/FTC-safe disclaimers.
- Do not remove medication, contraindication, safety, evidence, or disclaimer logic.
- Do not broaden the product into diagnosis, medication management, or clinical decision support.

## Engineering rules

- Make small, reviewable PRs.
- Do not rewrite the app unless explicitly asked.
- Do not change product positioning unless explicitly asked.
- Do not commit secrets or `.env` files.
- Do not invent environment variable names; update `.env.example`, `.env.local.sample`, `src/lib/env.ts`, and `scripts/check-env.mjs` together when env vars change.
- Do not modify Supabase schema without migration notes and rollback notes.
- Prefer server-side use of service-role keys only; never expose server-only secrets to the browser.
- Preserve Row Level Security assumptions.
- Keep production flow on GitHub + Vercel + Supabase + Stripe.

## Required checks before finishing a code task

Run the strongest available checks for the change:

```bash
npm run typecheck
npm run build
```

For launch/funnel work, also run:

```bash
npm run qa:env
```

If a check cannot run because secrets or external services are unavailable, say that clearly in the PR notes and explain what was not verified.

## Launch funnel smoke test

Before considering launch work done, manually verify:

1. Home page loads.
2. Quiz path is reachable.
3. Quiz submission is stored in Supabase.
4. Free Blueprint report can be generated/retrieved.
5. PDF export works.
6. Upgrade button reaches Stripe Checkout.
7. Stripe success returns to the app.
8. Stripe webhook syncs user tier to premium.
9. Premium dashboard unlocks for the paid user.
10. Billing portal works.
11. No secrets appear in logs or client bundles.
12. Vercel logs show no server errors for the funnel.

## Preferred PR format

Each PR should include:

- Purpose
- Files changed
- What was verified
- What was not verified
- Risks / rollback notes
- Follow-up tasks
