# Canonical domain rollout

The canonical production origin is `https://app.lve360.com`.

## Vercel configuration

The production project must receive requests for all three hosts:

- `app.lve360.com` — canonical application host
- `lve360.com` — legacy host redirected by Next.js
- `www.lve360.com` — legacy host redirected by Next.js

Before merging, confirm that `lve360.com` and `www.lve360.com` are assigned to the
same Vercel project as `app.lve360.com`. Remove any Vercel-level redirect from
`www.lve360.com` to the old root-domain deployment so the application redirect
rules can run.

## Verification

After the production deployment, verify that paths and query strings survive:

```text
https://lve360.com/pricing?plan=annual
  -> 308 https://app.lve360.com/pricing?plan=annual

https://www.lve360.com/results
  -> 308 https://app.lve360.com/results
```

Also verify that `https://app.lve360.com/` returns `200` without a redirect loop
and emits canonical metadata using the app origin.

## Rollback

If host routing interferes with the application, revert the production deployment
or remove the two host-based rules from `next.config.js`. Do not change the
`app.lve360.com` assignment during rollback.
