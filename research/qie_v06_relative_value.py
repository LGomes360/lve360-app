from __future__ import annotations

import json, math, os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

CAL_START = pd.Timestamp("2011-01-03")
CAL_END   = pd.Timestamp("2017-12-29")
VAL_START = pd.Timestamp("2018-01-02")
VAL_END   = pd.Timestamp("2022-12-30")
HOLD_DAYS = 10
MULT = 100.0
COMM = 0.65
BASE_HEDGE_BPS = 1.0
STRESS_HEDGE_BPS = 2.0
BASE_OPT_PENALTY = 0.0
STRESS_OPT_PENALTY = 0.02
MIN_OI = 100
TAIL_Q = 0.15

DATA_ROOT = Path(os.environ.get("QIE_DATA_ROOT", "/tmp/options-dataset"))
OUT_DIR = Path(os.environ.get("QIE_OUT_DIR", "qie_v06_results"))
OUT_DIR.mkdir(parents=True, exist_ok=True)

@dataclass
class Leg:
    ticker: str
    cid: str
    sign: int          # +1 long, -1 short
    qty: int
    expiration: pd.Timestamp

def load_underlying(ticker: str) -> pd.DataFrame:
    u = pd.read_parquet(DATA_ROOT / ticker.lower() / "underlying_prices.parquet")
    u["date"] = pd.to_datetime(u["date"])
    u = u.sort_values("date").drop_duplicates("date", keep="last").set_index("date")
    return u

def load_options(ticker: str) -> pd.DataFrame:
    cols = [
        "contract_id","expiration","strike","type","bid","ask","bid_size","ask_size",
        "open_interest","date","implied_volatility","delta","vega"
    ]
    parts = []
    for y in range(2011, 2023):
        p = DATA_ROOT / ticker.lower() / f"options_{y}.parquet"
        if not p.exists():
            continue
        print(f"LOAD {ticker} {y}", flush=True)
        d = pd.read_parquet(p, columns=cols)
        d["date"] = pd.to_datetime(d["date"])
        d["expiration"] = pd.to_datetime(d["expiration"])
        d["type"] = d["type"].astype(str).str.lower()
        d["dte"] = (d["expiration"] - d["date"]).dt.days
        for c in ["strike","bid","ask","bid_size","ask_size","open_interest","implied_volatility","delta","vega"]:
            d[c] = pd.to_numeric(d[c], errors="coerce")
        d = d.dropna(subset=["contract_id","date","expiration","strike","bid","ask","implied_volatility","delta","vega"])
        d = d[
            d["dte"].between(10, 80)
            & d["type"].isin(["call","put"])
            & d["delta"].abs().between(0.12, 0.70)
            & (d["ask"] >= d["bid"])
            & (d["bid"] >= 0)
            & (d["ask"] > 0)
            & (d["implied_volatility"] > 0)
            & (d["vega"] > 0)
        ]
        d = d[
            (d["open_interest"].fillna(0) >= MIN_OI)
            & (d["bid_size"].fillna(0) >= 1)
            & (d["ask_size"].fillna(0) >= 1)
        ]
        parts.append(d)
        print(f"  kept {len(d):,}", flush=True)
    if not parts:
        raise RuntimeError(f"No data for {ticker}")
    z = pd.concat(parts, ignore_index=True)
    return z.sort_values(["date","expiration","strike","type"]).reset_index(drop=True)

def pick_expiry(day: pd.DataFrame, target: int, lo: int, hi: int) -> Optional[pd.Timestamp]:
    e = day[day["dte"].between(lo, hi)][["expiration","dte"]].drop_duplicates()
    if e.empty:
        return None
    e = e.assign(dist=(e["dte"] - target).abs())
    return pd.Timestamp(e.sort_values(["dist","dte"]).iloc[0]["expiration"])

def select_atm_straddle(day: pd.DataFrame, target=42, lo=35, hi=50) -> Optional[dict]:
    exp = pick_expiry(day, target, lo, hi)
    if exp is None:
        return None
    x = day[day["expiration"].eq(exp)]
    c = x[(x["type"]=="call") & x["delta"].between(0.35,0.65)].copy()
    p = x[(x["type"]=="put") & x["delta"].between(-0.65,-0.35)].copy()
    if c.empty or p.empty:
        return None
    j = c.merge(p, on=["date","expiration","strike","dte"], suffixes=("_c","_p"))
    if j.empty:
        return None
    j["score"] = (j["delta_c"]-0.5).abs() + (j["delta_p"]+0.5).abs()
    r = j.sort_values("score").iloc[0]
    return {
        "date": pd.Timestamp(r["date"]), "expiration": pd.Timestamp(r["expiration"]), "dte": int(r["dte"]),
        "call_id": str(r["contract_id_c"]), "put_id": str(r["contract_id_p"]), "strike": float(r["strike"]),
        "iv": float((r["implied_volatility_c"]+r["implied_volatility_p"])/2),
        "vega": float(r["vega_c"]+r["vega_p"]),
        "call_delta": float(r["delta_c"]), "put_delta": float(r["delta_p"])
    }

def select_skew_pair(day: pd.DataFrame, target=42, lo=35, hi=50) -> Optional[dict]:
    exp = pick_expiry(day, target, lo, hi)
    if exp is None:
        return None
    x = day[day["expiration"].eq(exp)]
    calls = x[(x["type"]=="call") & x["delta"].between(0.15,0.35)].copy()
    puts  = x[(x["type"]=="put")  & x["delta"].between(-0.35,-0.15)].copy()
    if calls.empty or puts.empty:
        return None
    calls["score"] = (calls["delta"]-0.25).abs()
    puts["score"] = (puts["delta"]+0.25).abs()
    c = calls.sort_values("score").iloc[0]
    p = puts.sort_values("score").iloc[0]
    return {
        "date": pd.Timestamp(c["date"]), "expiration": pd.Timestamp(c["expiration"]),
        "call_id": str(c["contract_id"]), "put_id": str(p["contract_id"]),
        "call_iv": float(c["implied_volatility"]), "put_iv": float(p["implied_volatility"]),
        "call_vega": float(c["vega"]), "put_vega": float(p["vega"]),
        "call_delta": float(c["delta"]), "put_delta": float(p["delta"])
    }

def build_daily_features(opt: pd.DataFrame) -> dict:
    atm42, term, skew = {}, {}, {}
    for date, day in opt.groupby("date", sort=True):
        a = select_atm_straddle(day, 42, 35, 50)
        if a is not None:
            atm42[date] = a
        f = select_atm_straddle(day, 28, 21, 35)
        b = select_atm_straddle(day, 63, 50, 75)
        if f is not None and b is not None:
            term[date] = {"front":f, "back":b, "metric":f["iv"]/b["iv"]}
        s = select_skew_pair(day)
        if s is not None:
            s["metric"] = s["put_iv"] - s["call_iv"]
            skew[date] = s
    return {"atm42":atm42, "term":term, "skew":skew}

def quantiles(series: List[float]) -> Tuple[float,float]:
    a = np.asarray([x for x in series if np.isfinite(x)], dtype=float)
    return float(np.quantile(a, TAIL_Q)), float(np.quantile(a, 1-TAIL_Q))

def build_quote_index(opt: pd.DataFrame) -> pd.DataFrame:
    z = opt[(opt["date"]>=VAL_START) & (opt["date"]<=VAL_END)].copy()
    return z.set_index(["date","contract_id"]).sort_index()

def get_quote(idx: pd.DataFrame, date: pd.Timestamp, cid: str) -> Optional[pd.Series]:
    try:
        r = idx.loc[(date,cid)]
        if isinstance(r,pd.DataFrame):
            r = r.iloc[0]
        return r
    except KeyError:
        return None

def integer_vega_match(vega_a: float, vega_b: float, base_b=2) -> Tuple[int,int]:
    qb = base_b
    qa = int(round(qb * vega_b / max(vega_a, 1e-9)))
    qa = max(1, min(6, qa))
    return qa, qb

def entry_value(legs: List[Leg], indices: Dict[str,pd.DataFrame], date: pd.Timestamp, penalty: float) -> Tuple[float,float]:
    cash = 0.0
    gross = 0.0
    for leg in legs:
        r = get_quote(indices[leg.ticker], date, leg.cid)
        if r is None:
            raise RuntimeError("missing entry quote")
        px = float(r["ask"] if leg.sign>0 else r["bid"])
        gross += abs(px*MULT*leg.qty)
        cash += (-px*MULT*leg.qty if leg.sign>0 else px*MULT*leg.qty)
        cash -= COMM*leg.qty
        cash -= penalty*MULT*leg.qty
    return cash, gross

def exit_value(legs: List[Leg], indices: Dict[str,pd.DataFrame], date: pd.Timestamp, penalty: float) -> Optional[float]:
    cash = 0.0
    for leg in legs:
        r = get_quote(indices[leg.ticker], date, leg.cid)
        if r is None:
            return None
        px = float(r["bid"] if leg.sign>0 else r["ask"])
        cash += (px*MULT*leg.qty if leg.sign>0 else -px*MULT*leg.qty)
        cash -= COMM*leg.qty
        cash -= penalty*MULT*leg.qty
    return cash

def option_delta_exposure(legs: List[Leg], indices: Dict[str,pd.DataFrame], date: pd.Timestamp) -> Optional[Dict[str,float]]:
    out = {}
    for leg in legs:
        r = get_quote(indices[leg.ticker], date, leg.cid)
        if r is None:
            return None
        out[leg.ticker] = out.get(leg.ticker,0.0) + leg.sign*leg.qty*float(r["delta"])*MULT
    return out

def spot(under: Dict[str,pd.DataFrame], ticker: str, date: pd.Timestamp) -> Optional[float]:
    if date not in under[ticker].index:
        return None
    v = under[ticker].loc[date,"close"]
    return float(v) if np.isfinite(v) else None

def simulate_trade(
    legs: List[Leg], entry_date: pd.Timestamp, date_sequence: List[pd.Timestamp],
    indices: Dict[str,pd.DataFrame], under: Dict[str,pd.DataFrame],
    hedge_bps: float, opt_penalty: float
) -> Optional[dict]:
    try:
        option_cash, gross_premium = entry_value(legs,indices,entry_date,opt_penalty)
    except RuntimeError:
        return None
    deltas = option_delta_exposure(legs,indices,entry_date)
    if deltas is None:
        return None
    hedges = {}
    hedge_pnl = 0.0
    hedge_cost = 0.0
    prev_spots = {}
    for t,dx in deltas.items():
        s = spot(under,t,entry_date)
        if s is None: return None
        h = -dx
        hedges[t] = h
        prev_spots[t] = s
        hedge_cost += abs(h)*s*hedge_bps/10000.0

    last_date = entry_date
    steps = 0
    for date in date_sequence:
        if date <= entry_date:
            continue
        common_ok = True
        for t in hedges:
            s = spot(under,t,date)
            if s is None:
                common_ok=False; break
            hedge_pnl += hedges[t]*(s-prev_spots[t])
            prev_spots[t]=s
        if not common_ok:
            continue
        steps += 1
        last_date = date
        min_dte = min((leg.expiration-date).days for leg in legs)
        if steps >= HOLD_DAYS or min_dte <= 14:
            break
        new_d = option_delta_exposure(legs,indices,date)
        if new_d is None:
            continue
        for t in hedges:
            target = -new_d.get(t,0.0)
            change = target-hedges[t]
            hedge_cost += abs(change)*prev_spots[t]*hedge_bps/10000.0
            hedges[t]=target

    ex = exit_value(legs,indices,last_date,opt_penalty)
    if ex is None:
        # seek next few common dates with quotes
        for date in date_sequence:
            if date <= last_date: continue
            ex = exit_value(legs,indices,date,opt_penalty)
            if ex is not None:
                for t in hedges:
                    s=spot(under,t,date)
                    if s is None: continue
                    hedge_pnl += hedges[t]*(s-prev_spots[t])
                    prev_spots[t]=s
                last_date=date
                break
    if ex is None:
        return None
    for t,h in hedges.items():
        hedge_cost += abs(h)*prev_spots[t]*hedge_bps/10000.0
    pnl = option_cash + ex + hedge_pnl - hedge_cost
    gross_vega = 0.0
    for leg in legs:
        r = get_quote(indices[leg.ticker],entry_date,leg.cid)
        gross_vega += abs(float(r["vega"])*leg.qty*MULT)
    return {
        "entry":str(entry_date.date()), "exit":str(last_date.date()), "pnl":float(pnl),
        "option_cash_entry":float(option_cash), "hedge_pnl":float(hedge_pnl),
        "hedge_cost":float(hedge_cost), "gross_premium":float(gross_premium),
        "gross_vega_dollars":float(gross_vega),
        "pnl_per_gross_premium":float(pnl/max(gross_premium,1.0)),
        "hold_steps":int(steps)
    }

def annual_counts(trades: pd.DataFrame) -> dict:
    if trades.empty: return {}
    z=trades.copy(); z["year"]=pd.to_datetime(z["entry"]).dt.year
    return {str(int(y)):float(g["pnl"].sum()) for y,g in z.groupby("year")}

def summarize(name: str, trades: List[dict]) -> dict:
    d = pd.DataFrame(trades)
    if d.empty:
        return {"strategy":name,"trades":0}
    wins=d[d.pnl>0]; losses=d[d.pnl<0]
    gp=float(wins.pnl.sum()); gl=float(-losses.pnl.sum())
    annual=annual_counts(d)
    return {
        "strategy":name, "trades":int(len(d)),
        "win_rate":float(len(wins)/len(d)),
        "profit_factor":float(gp/gl) if gl>0 else None,
        "avg_pnl":float(d.pnl.mean()), "median_pnl":float(d.pnl.median()),
        "total_pnl":float(d.pnl.sum()), "worst_trade":float(d.pnl.min()),
        "avg_norm_pnl":float(d.pnl_per_gross_premium.mean()),
        "avg_hold_steps":float(d.hold_steps.mean()),
        "positive_years":int(sum(v>0 for v in annual.values())),
        "annual_pnl":annual
    }

def run_nonoverlap(name: str, signal_dates: List[pd.Timestamp], build_legs_fn, indices, under, base_dates, hedge_bps, penalty):
    trades=[]; blocked_until=None
    date_pos={d:i for i,d in enumerate(base_dates)}
    for d in signal_dates:
        if d<VAL_START or d>VAL_END or d not in date_pos: continue
        if blocked_until is not None and d<=blocked_until: continue
        built=build_legs_fn(d)
        if built is None: continue
        legs,meta=built
        seq=base_dates[date_pos[d]:min(len(base_dates),date_pos[d]+HOLD_DAYS+8)]
        tr=simulate_trade(legs,d,seq,indices,under,hedge_bps,penalty)
        if tr is None: continue
        tr.update(meta)
        trades.append(tr)
        blocked_until=pd.Timestamp(tr["exit"])
    return summarize(name,trades),pd.DataFrame(trades)

def main():
    tickers=["SPY","QQQ","IWM"]
    under={t:load_underlying(t) for t in tickers}
    opts={t:load_options(t) for t in tickers}
    feats={t:build_daily_features(opts[t]) for t in tickers}
    indices={t:build_quote_index(opts[t]) for t in tickers}

    # Calibration thresholds, frozen before validation.
    term_vals=[v["metric"] for d,v in feats["SPY"]["term"].items() if CAL_START<=d<=CAL_END]
    skew_vals=[v["metric"] for d,v in feats["SPY"]["skew"].items() if CAL_START<=d<=CAL_END]
    cross_q_vals=[]; cross_i_vals=[]
    common_cal=sorted(set(feats["SPY"]["atm42"])&set(feats["QQQ"]["atm42"])&set(feats["IWM"]["atm42"]))
    for d in common_cal:
        if CAL_START<=d<=CAL_END:
            cross_q_vals.append(feats["QQQ"]["atm42"][d]["iv"]/feats["SPY"]["atm42"][d]["iv"])
            cross_i_vals.append(feats["IWM"]["atm42"][d]["iv"]/feats["SPY"]["atm42"][d]["iv"])
    thresholds={
        "term":quantiles(term_vals),
        "skew":quantiles(skew_vals),
        "qqq_spy":quantiles(cross_q_vals),
        "iwm_spy":quantiles(cross_i_vals),
    }
    calibration={
        "period":[str(CAL_START.date()),str(CAL_END.date())],
        "tail_quantile":TAIL_Q,
        "thresholds":{k:list(v) for k,v in thresholds.items()},
        "n":{"term":len(term_vals),"skew":len(skew_vals),"qqq_spy":len(cross_q_vals),"iwm_spy":len(cross_i_vals)}
    }
    (OUT_DIR/"calibration.json").write_text(json.dumps(calibration,indent=2))
    print("CALIBRATION",json.dumps(calibration),flush=True)

    base_dates=sorted(d for d in under["SPY"].index if VAL_START<=d<=VAL_END)

    strategies={}
    # 1) SPY term structure
    lo,hi=thresholds["term"]
    term_signals=[d for d,v in feats["SPY"]["term"].items() if VAL_START<=d<=VAL_END and (v["metric"]<=lo or v["metric"]>=hi)]
    def term_builder(d):
        v=feats["SPY"]["term"].get(d)
        if not v:return None
        f,b=v["front"],v["back"]; qf,qb=integer_vega_match(f["vega"],b["vega"],2)
        rich_front=v["metric"]>=hi
        sf=-1 if rich_front else 1; sb=1 if rich_front else -1
        legs=[
            Leg("SPY",f["call_id"],sf,qf,f["expiration"]),Leg("SPY",f["put_id"],sf,qf,f["expiration"]),
            Leg("SPY",b["call_id"],sb,qb,b["expiration"]),Leg("SPY",b["put_id"],sb,qb,b["expiration"])
        ]
        return legs,{"signal":float(v["metric"]),"direction":"short_front" if rich_front else "long_front","front_qty":qf,"back_qty":qb}
    strategies["term"]= (term_signals,term_builder)

    # 2) SPY skew risk reversal, delta hedged
    lo,hi=thresholds["skew"]
    skew_signals=[d for d,v in feats["SPY"]["skew"].items() if VAL_START<=d<=VAL_END and (v["metric"]<=lo or v["metric"]>=hi)]
    def skew_builder(d):
        v=feats["SPY"]["skew"].get(d)
        if not v:return None
        rich_put=v["metric"]>=hi
        # Rich downside skew: short put / long call. Reverse when unusually flat.
        sp=-1 if rich_put else 1; sc=1 if rich_put else -1
        qp,qc=integer_vega_match(v["put_vega"],v["call_vega"],1)
        legs=[Leg("SPY",v["put_id"],sp,qp,v["expiration"]),Leg("SPY",v["call_id"],sc,qc,v["expiration"])]
        return legs,{"signal":float(v["metric"]),"direction":"sell_skew" if rich_put else "buy_skew","put_qty":qp,"call_qty":qc}
    strategies["skew"]=(skew_signals,skew_builder)

    # 3/4) Cross-index ATM volatility spreads
    for other,key in [("QQQ","qqq_spy"),("IWM","iwm_spy")]:
        lo,hi=thresholds[key]
        common=sorted(set(feats["SPY"]["atm42"])&set(feats[other]["atm42"]))
        sig=[]
        metric_by_date={}
        for d in common:
            if VAL_START<=d<=VAL_END:
                m=feats[other]["atm42"][d]["iv"]/feats["SPY"]["atm42"][d]["iv"]
                metric_by_date[d]=m
                if m<=lo or m>=hi:sig.append(d)
        def make_builder(other=other,key=key,lo=lo,hi=hi,metric_by_date=metric_by_date):
            def builder(d):
                a=feats["SPY"]["atm42"].get(d); b=feats[other]["atm42"].get(d)
                if not a or not b:return None
                m=metric_by_date[d]; rich_other=m>=hi
                qo,qs=integer_vega_match(b["vega"],a["vega"],2)
                so=-1 if rich_other else 1; ss=1 if rich_other else -1
                legs=[
                    Leg(other,b["call_id"],so,qo,b["expiration"]),Leg(other,b["put_id"],so,qo,b["expiration"]),
                    Leg("SPY",a["call_id"],ss,qs,a["expiration"]),Leg("SPY",a["put_id"],ss,qs,a["expiration"])
                ]
                return legs,{"signal":float(m),"direction":f"short_{other.lower()}" if rich_other else f"long_{other.lower()}",
                             f"{other.lower()}_qty":qo,"spy_qty":qs}
            return builder
        strategies[key]=(sig,make_builder())

    # Run base + stressed validation. Holdout is deliberately not present in this runner.
    reports=[]; eligible=[]
    for name,(sig,builder) in strategies.items():
        m,t=run_nonoverlap(name,sig,builder,indices,under,base_dates,BASE_HEDGE_BPS,BASE_OPT_PENALTY)
        ms,ts=run_nonoverlap(name+"_stress",sig,builder,indices,under,base_dates,STRESS_HEDGE_BPS,STRESS_OPT_PENALTY)
        m.update({
            "stress_trades":ms.get("trades",0),
            "stress_profit_factor":ms.get("profit_factor"),
            "stress_avg_pnl":ms.get("avg_pnl"),
            "stress_total_pnl":ms.get("total_pnl"),
            "stress_positive_years":ms.get("positive_years",0),
        })
        reports.append(m)
        t.to_csv(OUT_DIR/f"{name}_trades.csv",index=False)
        ts.to_csv(OUT_DIR/f"{name}_stress_trades.csv",index=False)
        passes=(
            m.get("trades",0)>=25
            and (m.get("profit_factor") or 0)>=1.20
            and (m.get("avg_pnl") or -1)>0
            and m.get("positive_years",0)>=3
            and (m.get("stress_profit_factor") or 0)>=1.05
            and (m.get("stress_avg_pnl") or -1)>0
            and m.get("stress_positive_years",0)>=3
        )
        m["passes_gate"]=bool(passes)
        if passes: eligible.append(name)
        print("VALIDATION",json.dumps(m),flush=True)

    summary={
        "protocol":{
            "calibration":[str(CAL_START.date()),str(CAL_END.date())],
            "validation":[str(VAL_START.date()),str(VAL_END.date())],
            "holdout":"2023-2025 SEALED",
            "hold_days":HOLD_DAYS,
            "base_execution":{"hedge_bps":BASE_HEDGE_BPS,"option_penalty":BASE_OPT_PENALTY},
            "stress_execution":{"hedge_bps":STRESS_HEDGE_BPS,"option_penalty":STRESS_OPT_PENALTY},
            "gate":{"min_trades":25,"profit_factor":1.20,"positive_years":3,"stress_profit_factor":1.05,"stress_positive_years":3}
        },
        "calibration":calibration,
        "validation":reports,
        "eligible_for_holdout":eligible,
        "holdout_opened":False
    }
    pd.DataFrame(reports).to_csv(OUT_DIR/"validation_summary.csv",index=False)
    (OUT_DIR/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_V06_BEGIN")
    print(json.dumps(summary,indent=2))
    print("FINAL_V06_END")

if __name__=="__main__":
    main()
