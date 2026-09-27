# MOTU Forward — Prospective Protocol

Status: FROZEN prospective protocol
Effective: 2026-09-27
Research branch only. Do not merge into production/main.

## Control
MOTU Small Prime is frozen at the v0.6 four-slot implementation:
- reference NAV: $166,912.81
- 4 independent cash ledgers / slots
- no margin
- cash-secured puts only
- VRP primary ranking
- underlying above 200-day SMA
- 45-day earnings/event blackout
- put target delta: -0.20
- DTE: 7–21, target 14
- assignment: take shares
- no new puts while assigned
- covered calls after assignment
- calls must not strike below economic basis
- call target delta: +0.20
- $0.65/contract commissions
- premium is cash flow, not profit

## Prospective evidence rules
1. Every decision snapshot is timestamped and committed before its measurement period.
2. Never edit an old snapshot to improve a decision. Corrections are appended as new records.
3. Preserve bid, ask, delta, IV, underlying, SMA200, earnings date, realized-vol input, VRP rank, strike, expiry, contract count and required collateral.
4. Record SKIP decisions and the reason. Refusing bad underwriting is part of the strategy.
5. Executable paper entry uses the frozen conservative convention unless a real fill is supplied.
6. Maintain premium cash separately from economic P&L/NAV.
7. Benchmark against SPY and QQQ, but do not optimize Prime to them.
8. New hypotheses belong in MOTU Lab.
9. Corporate actions require an explicit ledger event; never silently restate history.
10. No leverage to rescue affordability.

## Checkpoints
- 12 weeks: operational validation.
- 6 months: first economic validation.
- ~12 months and multiple regimes: capital-allocation review.

No live-capital recommendation is implied by a checkpoint pass.
