# Founder AI cost completeness

## Purpose

When a generation has no usable estimated cost, the founder dashboard previously
counted that value as zero. It now shows the known subtotal, the number of
generations with unknown cost, and a reporting warning. A task with only unknown
costs displays `Unavailable`; an explicitly reported zero remains zero. Positive
amounts below a cent display `<$0.01`.

The broad activity card now says `Accounts with activity` and specifies that it
includes page views. Its query and count are unchanged; it is not a meaningful
practice-completion or retention metric.

## Data and access

- Reuses the existing aggregate ledger query and its reporting limit.
- Adds no database fields, migration, member content, credentials, or AI calls.
- Preserves founder authorization, server-only admin access, and scorecard RPC.
- Unknown cost includes null, blank, nonnumeric, nonfinite, or negative values.
- Estimates remain separate from provider billing and do not promise complete
  accounting for retries or missing ledger writes.

## Verification

Run with the repository-supported Node 22 runtime:

```bash
npm run qa:founder-costs
npm run qa:pr182
npm run typecheck
npm run build
```

The cost checks cover mixed known/unknown records, all-unknown costs, explicit
zero, an empty window, invalid values, and separate task totals. CI runs them.
Local production builds may require nonsecret build-only values for the existing
public Supabase variables. Such a build does not validate authenticated live data.

## Rollback

Revert this reporting change. No database, model, or credential rollback is needed.
