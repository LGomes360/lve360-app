# MOTU

**Master of the Universe**  
Formal expansion: **Market Options Tactical Underwriter**

MOTU is a research system for systematic equity-option underwriting. It is not a live trading bot and must not place orders.

## Thesis

Option premium is not itself profit. MOTU seeks names where the compensation for accepting a defined equity obligation is unusually attractive relative to realized risk, fundamental/event risk, and portfolio concentration.

The system separates four jobs:

1. **Universe** — decide which underlyings are acceptable to own and rank them cross-sectionally.
2. **Underwriter** — choose DTE, delta, strike, entry price, and assignment/call-away rules.
3. **Trouble Gate** — reduce or veto short-convexity exposure when macro/credit/Treasury transmission is deteriorating.
4. **Treasury** — allocate collateral, cap concentration, and distinguish gross premium cash flow from economic P&L.

## v0.1 research question

Does cross-sectional stock selection improve the expectancy of short-dated cash-secured put underwriting versus generic index premium selling?

### Data
- DoltHub post-no-preference/options: option chains + volatility history.
- DoltHub post-no-preference/stocks: OHLCV.
- DoltHub post-no-preference/earnings: earnings calendar.

### Pilot universe
AAPL, AMD, AMZN, BA, COST, CVX, DIS, JPM, MSFT, NFLX, NVDA, ORCL, PYPL, TSLA, WMT, XOM.

### Frozen validation
- Feature history: 2019–2020 as available.
- Validation: 2021–2022.
- Holdout: 2023–2025 sealed.
- Entry: first trading day of each week.
- Contract: 7–21 DTE, target 14 DTE, target -0.20 delta put.
- Fill: historical bid.
- Stress: bid minus $0.05 and doubled commission.
- No stop, roll, or discretionary override in v0.1.

### Cross-sectional selectors
- VRP: highest IV/HV ratio.
- VRP + IV rank: 65% cross-sectional VRP percentile + 35% IV-rank percentile.
- Trend underwriter: composite score, only above 200-day SMA.
- Earnings aware: trend underwriter excluding earnings in the following 21 days.
- Quality pullback: earnings-aware candidates above 200-day SMA but below 20-day SMA.

### Validation gate
A selector is eligible for holdout only if:
- >= 70 actual chain trades,
- profit factor >= 1.25,
- positive mean trade P&L,
- positive total P&L in both 2021 and 2022,
- stressed profit factor >= 1.10,
- stressed mean trade P&L positive,
- stressed total P&L positive in both years.

## Next stages

If v0.1 passes:
- v0.2: complete wheel state machine: put assignment -> stock inventory -> covered calls.
- v0.3: simultaneous covered-combo / covered-strangle testing.
- v0.4: portfolio slots, collateral yield, portfolio-margin scenarios, concentration limits.
- v0.5: integrate Trouble Gauge as a predeclared regime modifier.
- v0.6: current weekly screen and paper-trading ledger.

If v0.1 fails:
- do not tune thresholds against 2023–2025.
- diagnose whether the missing edge is event selection, fundamentals, or execution rather than consuming the holdout.

## Non-negotiables

- Gross option premium is cash received, not economic profit.
- Never optimize to a desired income number.
- No naked leverage solely to manufacture return.
- Report assignments, tail loss, drawdown, collateral commitment, and stock P&L alongside premium.
- The engine must be better at refusing trades than finding them.


## Research log

### v0.1 — cross-sectional standalone puts
Validation: 2021–2022. Holdout 2023–2025 remained sealed.

All five predeclared selectors failed when each short put was treated as an independent trade. High win rates were overwhelmed by a small number of large stock declines. This was useful diagnostically but did not represent the colleague-described inventory cycle.

### v0.2 — true wheel state machine
Validation: 2021–2022. Research NAV: $2.0M in five equal underwriting slots.

Mechanics:
- sell 7–21 DTE puts targeting -0.20 delta;
- accept assignment into shares;
- after assignment sell covered calls targeting +0.20 delta;
- one symbol per slot; no duplicate-symbol pyramiding;
- compare pure delta calls with calls not struck below effective economic basis;
- explicitly account for 2021–2022 NVDA, AMZN, and TSLA stock splits;
- stress fills by reducing option credit $0.05 and doubling commissions.

Result: every configuration failed. The best base configuration was VRP + basis-protected calls, with approximately -7.6% CAGR and a roughly -38% weekly marked drawdown. VRP + IV-rank + delta calls collected about $694K of gross option premium on $2M of model capital over the two-year validation, but still compounded at roughly -9.6%. This confirms that gross premium cash flow can look extraordinary while economic P&L is poor.

The core failure was underwriting collapsing individual equities. Large realized cycle losses appeared in PYPL, NFLX, DIS, TSLA, ORCL, AMD, and others. Option premium did not compensate for owning structurally declining shares.

### v0.3 — Trouble Gate
Predeclared before running:
- **event45** — no new puts if earnings occur within the following 45 calendar days.
- **stocktrend_event45** — event45 plus stock must be above its 200-day moving average.
- **adaptive_trouble** — stocktrend_event45 plus reduce new-underwriting capacity from five slots to two while SPY is at/below its 200-day moving average.
- **hard_market_gate** — stocktrend_event45 plus no new puts while SPY is at/below its 200-day moving average.

Existing assigned stock is never force-liquidated by a gate. Covered-call management continues. The gate controls only new downside underwriting.

SPY/SMA200 is a deliberately simple market-regime proxy for this diagnostic. It is not the full Trouble Gauge; credit/Treasury transmission should only be added in a later version if this simpler gating mechanism produces a robust improvement.

The 2023–2025 holdout remains sealed.
