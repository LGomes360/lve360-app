# MOTU Forward: Day-0 operations

Research branch: `research/motu-v01-underwriter-20260926`. Never merge into main
or deploy this work. Prime and historical source are frozen; hypotheses go to MOTU Lab.

## What this implements

An interactive, read-only Tradier production API capture for the 16-symbol v0.6
universe. The only HTTP operations are GET requests to market clock, quotes,
option expirations and option chains. No scraping, orders, accounts, margin,
automatic scheduling, credentials in source, or capital deployment.

This command supports the **initial all-cash shadow portfolio only** at
$166,912.81 / four slots. It is not an ongoing portfolio ledger. After Day-0,
assignment, shares, economic basis and covered calls need a stateful ledger;
do not rerun this command to pretend an existing portfolio is all cash.

## Provider setup and input prerequisites

Use an authorized Tradier Brokerage production token with real-time US options
market-data entitlement. No subscription/account is created by this code. Enter
the token at the hidden terminal prompt; never put it in a command, CSV, chat,
repository, or environment file. Sandbox data is delayed and cannot be Day-0.
The adapter does not provide a sandbox override. Provider/API errors abort the run.

Copy `context_template.csv` to a private file and fill all 16 rows from legitimate
licensed exports or documented APIs. Blank values deliberately fail validation.

Required context fields:

| Field | Meaning |
|---|---|
| session_date | Intended US trading date (YYYY-MM-DD) |
| metrics_date | Date of SMA and stock-level volatility metrics; no more than four calendar days old |
| observed_at | Time the inputs were actually known, ISO 8601 with timezone; no future data |
| sma200 | 200-session simple moving average, on the same split basis as the underlying |
| realized_vol / iv | Positive stock-level volatility inputs in consistent annualized decimal units |
| iv_rank | Stock-level annual IV rank, 0–1, matching historical secondary ranking |
| source | Traceable provider/export/issuer reference; retain source export privately |
| volatility_method | Document HV window, annualization, IV tenor/aggregation and corporate-action treatment |
| frozen_input_compatibility | Enter `reviewed` only after confirming those definitions match frozen inputs |
| next_earnings_date | Verified upcoming earnings date; unknown is blocked, never treated as safe |
| events_checked_through | Calendar coverage must extend at least 45 days beyond session_date |
| corporate_action_clear | `yes` only after reviewing splits/adjustments through all 7–21 DTE expiries |

The historical model reads provider `hv_current` / `iv_current`; it does not
define a new realized-volatility estimator. This adapter therefore does **not**
substitute 20-day volatility, contract IV, or an invented earnings date. The
operator's documented source-compatibility review remains a required setup step.
Provider data completeness and these attestations cannot be independently proved
by a CSV schema. Keep the source exports with the evidence.

## Run from repository root (Python 3.11+)

```text
python -m pip install -r research/motu_forward/requirements-test.txt
python -m unittest discover -s research/tests -v
python research/motu_forward.py capture-day0 --context /private/motu/context.csv --out /private/motu/day0-unique-run-id --confirm-new-shadow-portfolio
python research/motu_forward.py replay /private/motu/day0-unique-run-id --out /private/motu/replay-unique-id.json
```

Use equivalent absolute paths on Windows. Run in an interactive terminal during
regular market hours. The provider clock checks actual holidays and shortened
sessions at both ends of capture. No user-supplied `--asof` can manufacture Day-0.
An existing output directory is refused. A failure after evidence creation can
leave an evidence-only directory; absence of `day0.json` means no decision was
published. Retry with a new directory and keep the failed bundle for diagnosis.

## Evidence and data-quality policy

Each successful capture keeps `raw.json` (provider responses and receive times),
`context.csv`, `snapshot.csv`, `manifest.json` (SHA-256 hashes and rejects), and
`day0.json`. Decision output includes model inputs, option identity, quote sizes,
individual quote/Greeks times, ranking, collateral, commissions, cash decisions,
protocol and code hashes. Hashes detect changes; they are not a trusted timestamp
or proof against deliberate rewriting of an entire bundle.

Quotes and underlying last-trade timestamps must be no more than 120 seconds
old, with no future times; Greek timestamps may be at most 65 minutes old because
Tradier publishes them hourly. This age is explicit: Greeks are not described as
live. Adjusted contracts, crossed/empty quotes, non-finite inputs and invalid
identities are rejected. API failures abort the whole capture. Invalid individual
contracts are logged, never silently repaired. These are data-quality admission
rules, not optimized trading parameters. A zero-valid-contract capture is blocked.

The bid is a conservative **paper decision price**, not a fill. Displayed size,
rapid market changes and stale Greeks can prevent execution; no paper profit is
recorded from premium. Retain quote size when checking whether any later paper
fill could actually have occurred. Replays are always `REPLAY_NOT_PROSPECTIVE`.

Commit the decision and its hashes on the research branch before the measurement
period, or register them in a separate append-only timestamped research archive.
Store licensed raw data privately; do not redistribute it through a public repo
or public Actions artifacts. No automatic commit or public upload occurs.
Append corrections under new IDs referencing the original hash; never overwrite.

## Frozen implementation alignment

The original Forward CSV scaffold was not equivalent to v0.6. The Day-0 path now
uses the unchanged v0.6 rules: stock IV/HV then IV-rank ordering; 45-day inclusive
earnings blackout; OTM puts, delta [-0.45, -0.03], 7–21 DTE, bid >= $0.05,
relative spread <= 0.60; score = 5*abs(delta+0.20)+abs(DTE-14)/14; spread tie-break;
choose contract before affordability; full 100-share collateral; $0.65 commission.
Exact numeric ties are resolved deterministically by symbol/expiry/strike.
The four-slot control uses `stocktrend_event45`, not a new credit/market veto.
The trend comparison uses the captured underlying against the sourced SMA200;
intraday operation differs in observation time from historical daily-close data.

`PROTOCOL.md` and `motu_v06_small_capital.py` are unchanged and protected by hash
tests. A parity test executes the historical `choose_put` function on 100 seeded
synthetic chains. No backtest tuning is introduced.

## Verification and outstanding setup

Offline tests use synthetic data only. They exercise capture/replay, closed
markets, partial failure, integrity, immutable outputs, stale/future timestamps,
missing earnings, sizing, ranking and frozen selection. The branch-only Actions
workflow runs these without market credentials, raw-data uploads or deployment.

Live authentication, entitlement and real provider payloads still require a
credentialed market-open smoke run. No valid Day-0 observation has been created.
The application typecheck/build were unavailable in the connector-fetched
research-only working copy; no application source or deployment settings changed.
Rollback: revert the ingestion commit on this research branch, retaining any
already-published evidence. Never edit the historical protocol to accommodate a run.

## Primary provider documentation

- [Market data entitlement, delay and hourly Greeks](https://docs.tradier.com/docs/market-data)
- [Option chains](https://docs.tradier.com/reference/brokerage-api-markets-get-options-chains)
- [Quote fields and timestamps](https://docs.tradier.com/docs/quotes)
- [Market clock](https://docs.tradier.com/reference/brokerage-api-markets-get-clock)

Documentation checked 2026-09-27.
