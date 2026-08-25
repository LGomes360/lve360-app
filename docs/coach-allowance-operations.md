# Ask LVE360 allowance operations

Ask LVE360 has two independent monthly safeguards:

- a question allowance, shown to the member with the exact UTC reset date
- a production dollar ceiling, which is never increased by a testing adjustment

## Grant approved testing questions

Run the operator command only for an approved premium or trial test account:

```powershell
npm.cmd run admin:coach-top-up -- --email member@example.com --turns 20 --reason "Approved regression testing" --granted-by "Operator name"
```

The command uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the operator environment. It creates or replaces the account's adjustment for the current UTC month and prints a non-secret audit summary.

Use `--period YYYY-MM-01` only when an adjustment is intentionally being prepared for a different UTC month. Use `--turns 0` to remove the additional question allowance while preserving the audit reason.

## Guardrails

- Adjustments are limited to 100 additional questions per month.
- Only the server role can read or write adjustments.
- Members cannot grant themselves an adjustment.
- Reasons must describe the testing purpose and must not contain health information.
- The production dollar ceiling remains unchanged, even after a question adjustment.
