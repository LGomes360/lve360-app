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
