from __future__ import annotations
import json, os, time
from pathlib import Path
from typing import Optional, Tuple
import numpy as np
import pandas as pd
import requests

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v01_results")); OUT.mkdir(parents=True,exist_ok=True)
OPT_API="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
STK_API="https://www.dolthub.com/api/v1alpha1/post-no-preference/stocks/master"
ERN_API="https://www.dolthub.com/api/v1alpha1/post-no-preference/earnings/master"

FEATURE_START=pd.Timestamp("2019-01-01")
PRICE_START=pd.Timestamp("2018-01-01")
VAL_START=pd.Timestamp("2021-01-01")
VAL_END=pd.Timestamp("2022-12-31")
HOLDOUT="2023-2025 SEALED"

UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
TARGET_DTE=14
DTE_MIN=7
DTE_MAX=21
TARGET_DELTA=-0.20
MAX_REL_SPREAD=0.50
MIN_BID=0.05
COMMISSION=0.65
STRESS_PRICE_PENALTY=0.05
TIMEOUT=45

session=requests.Session()
session.headers.update({"User-Agent":"MOTU-research/0.1"})

def sql(api:str, query:str, tries:int=4)->pd.DataFrame:
    last=None
    for i in range(tries):
        try:
            r=session.get(api,params={"q":query},timeout=TIMEOUT)
            r.raise_for_status()
            j=r.json()
            if j.get("query_execution_status")!="Success":
                raise RuntimeError(j.get("query_execution_message","query failed"))
            return pd.DataFrame(j.get("rows",[]))
        except Exception as e:
            last=e
            time.sleep(1.5*(i+1))
    raise RuntimeError(f"SQL failed after {tries} tries: {last}\n{query}")

def load_vol(sym:str)->pd.DataFrame:
    q=f"""SELECT date, act_symbol, hv_current, hv_year_high, hv_year_low,
                 iv_current, iv_year_high, iv_year_low
          FROM volatility_history
          WHERE act_symbol='{sym}' AND date>='{FEATURE_START.date()}' AND date<='{VAL_END.date()}'
          ORDER BY date"""
    d=sql(OPT_API,q)
    if d.empty:return d
    d["date"]=pd.to_datetime(d["date"])
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:
        d[c]=pd.to_numeric(d[c],errors="coerce")
    return d.sort_values("date")

def load_stock(sym:str)->pd.DataFrame:
    q=f"""SELECT date, open, high, low, close, volume
          FROM ohlcv
          WHERE act_symbol='{sym}' AND date>='{PRICE_START.date()}' AND date<='{VAL_END.date()}'
          ORDER BY date"""
    d=sql(STK_API,q)
    if d.empty:return d
    d["date"]=pd.to_datetime(d["date"])
    for c in ["open","high","low","close","volume"]:
        d[c]=pd.to_numeric(d[c],errors="coerce")
    d=d.dropna(subset=["close"]).sort_values("date").drop_duplicates("date")
    d["sma20"]=d.close.rolling(20).mean()
    d["sma200"]=d.close.rolling(200).mean()
    d["ret20"]=d.close/d.close.shift(20)-1
    d["dd20"]=d.close/d.close.rolling(20).max()-1
    return d

def load_earnings(sym:str)->pd.DataFrame:
    q=f"""SELECT act_symbol, date
          FROM earnings_calendar
          WHERE act_symbol='{sym}' AND date>='{FEATURE_START.date()}' AND date<='2023-01-31'
          ORDER BY date"""
    try:
        d=sql(ERN_API,q)
    except Exception as e:
        print("EARNINGS_QUERY_WARN",sym,repr(e),flush=True)
        return pd.DataFrame(columns=["act_symbol","date"])
    if d.empty:return d
    d["date"]=pd.to_datetime(d["date"])
    return d.sort_values("date")

def asof_row(d:pd.DataFrame, date:pd.Timestamp, max_age_days:int=7)->Optional[pd.Series]:
    if d.empty:return None
    x=d[d.date<=date]
    if x.empty:return None
    r=x.iloc[-1]
    if (date-r.date).days>max_age_days:return None
    return r

def earnings_near(e:pd.DataFrame,date:pd.Timestamp,days:int=21)->bool:
    if e.empty:return False
    return bool(((e.date>=date)&(e.date<=date+pd.Timedelta(days=days))).any())

def chain(sym:str,date:pd.Timestamp)->pd.DataFrame:
    lo=(date+pd.Timedelta(days=DTE_MIN)).date()
    hi=(date+pd.Timedelta(days=DTE_MAX)).date()
    q=f"""SELECT date, expiration, strike, call_put, bid, ask, vol, delta, gamma, vega
          FROM option_chain
          WHERE act_symbol='{sym}' AND date='{date.date()}'
            AND expiration>='{lo}' AND expiration<='{hi}'
          ORDER BY expiration, strike, call_put
          LIMIT 5000"""
    d=sql(OPT_API,q)
    if d.empty:return d
    d["date"]=pd.to_datetime(d["date"]);d["expiration"]=pd.to_datetime(d["expiration"])
    for c in ["strike","bid","ask","vol","delta","gamma","vega"]:
        d[c]=pd.to_numeric(d[c],errors="coerce")
    d["dte"]=(d.expiration-d.date).dt.days
    d["rel_spread"]=(d.ask-d.bid)/((d.ask+d.bid)/2).replace(0,np.nan)
    return d

def choose_put(ch:pd.DataFrame,spot:float)->Optional[pd.Series]:
    if ch.empty:return None
    p=ch[ch.call_put.astype(str).str.lower().str.startswith("p")].copy()
    p=p[p.dte.between(DTE_MIN,DTE_MAX)&(p.strike<spot)&(p.bid>=MIN_BID)&(p.ask>=p.bid)&(p.rel_spread<=MAX_REL_SPREAD)]
    p=p[p.delta.between(-0.45,-0.03)]
    if p.empty:return None
    p["score"]=(p.dte-TARGET_DTE).abs()/TARGET_DTE+(p.delta-TARGET_DELTA).abs()*5
    return p.sort_values(["score","rel_spread"]).iloc[0]

def expiry_close(stk:pd.DataFrame,expiration:pd.Timestamp)->Tuple[Optional[pd.Timestamp],Optional[float]]:
    x=stk[stk.date<=expiration]
    if x.empty:return None,None
    r=x.iloc[-1]
    return pd.Timestamp(r.date),float(r.close)

def pct_rank(s:pd.Series)->pd.Series:
    return s.rank(pct=True,method="average")

def build_candidates(vols,stocks,earnings)->pd.DataFrame:
    anchor=stocks["AAPL"]
    val=anchor[(anchor.date>=VAL_START)&(anchor.date<=VAL_END)].copy()
    val["week"]=val.date.dt.to_period("W-SUN")
    entries=val.groupby("week").date.min().tolist()
    rows=[]
    for date in entries:
        week=[]
        for sym in UNIVERSE:
            vr=asof_row(vols.get(sym,pd.DataFrame()),date,7)
            sr=asof_row(stocks.get(sym,pd.DataFrame()),date,3)
            if vr is None or sr is None:continue
            vals={c:float(vr[c]) if pd.notna(vr[c]) else np.nan for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]}
            if not np.isfinite(vals["hv_current"]) or vals["hv_current"]<=0 or not np.isfinite(vals["iv_current"]):continue
            denom=vals["iv_year_high"]-vals["iv_year_low"]
            iv_rank=(vals["iv_current"]-vals["iv_year_low"])/denom if np.isfinite(denom) and denom>1e-9 else np.nan
            week.append({
                "date":date,"symbol":sym,"close":float(sr.close),
                "sma20":float(sr.sma20) if pd.notna(sr.sma20) else np.nan,
                "sma200":float(sr.sma200) if pd.notna(sr.sma200) else np.nan,
                "ret20":float(sr.ret20) if pd.notna(sr.ret20) else np.nan,
                "dd20":float(sr.dd20) if pd.notna(sr.dd20) else np.nan,
                "iv":vals["iv_current"],"hv":vals["hv_current"],
                "vrp_ratio":vals["iv_current"]/vals["hv_current"],
                "iv_rank":float(np.clip(iv_rank,0,1)) if np.isfinite(iv_rank) else np.nan,
                "earnings_21d":earnings_near(earnings.get(sym,pd.DataFrame()),date,21)
            })
        if not week:continue
        w=pd.DataFrame(week)
        w["vrp_pct"]=pct_rank(w.vrp_ratio)
        w["ivrank_pct"]=pct_rank(w.iv_rank.fillna(w.iv_rank.median()))
        w["composite"]=0.65*w.vrp_pct+0.35*w.ivrank_pct
        w["above200"]=w.close>w.sma200
        w["pullback"]=w.close<w.sma20
        rows.append(w)
    return pd.concat(rows,ignore_index=True) if rows else pd.DataFrame()

def selections(cand:pd.DataFrame)->pd.DataFrame:
    out=[]
    for date,w in cand.groupby("date"):
        specs={
            "vrp":w,
            "vrp_ivrank":w,
            "trend_underwriter":w[w.above200],
            "earnings_aware":w[w.above200 & ~w.earnings_21d],
            "quality_pullback":w[w.above200 & w.pullback & ~w.earnings_21d],
        }
        for name,x in specs.items():
            if x.empty:continue
            if name=="vrp":
                r=x.sort_values(["vrp_ratio","iv_rank"],ascending=False).iloc[0]
            else:
                r=x.sort_values(["composite","vrp_ratio"],ascending=False).iloc[0]
            z=r.to_dict();z["variant"]=name;out.append(z)
    return pd.DataFrame(out)

def trade_one(row,chains,stocks,stress=False)->Optional[dict]:
    sym=row.symbol;date=pd.Timestamp(row.date);key=(sym,str(date.date()))
    if key not in chains:
        try:
            chains[key]=chain(sym,date)
        except Exception as e:
            print("CHAIN_WARN",sym,date.date(),repr(e),flush=True);chains[key]=pd.DataFrame()
    p=choose_put(chains[key],float(row.close))
    if p is None:return None
    ed,close=expiry_close(stocks[sym],pd.Timestamp(p.expiration))
    if ed is None or close is None:return None
    credit=max(0,float(p.bid)-(STRESS_PRICE_PENALTY if stress else 0))
    if credit<=0:return None
    fees=COMMISSION*(2 if stress else 1)
    premium=credit*100-fees
    intrinsic=max(0,float(p.strike)-close)*100
    pnl=premium-intrinsic
    collateral=max(1,float(p.strike)*100-premium)
    return {
        "variant":row.variant+("_stress" if stress else ""),
        "entry":str(date.date()),"symbol":sym,"expiration":str(pd.Timestamp(p.expiration).date()),
        "expiry_session":str(ed.date()),"spot_entry":float(row.close),"spot_expiry":close,
        "strike":float(p.strike),"delta":float(p.delta),"dte":int(p.dte),
        "bid":float(p.bid),"ask":float(p.ask),"rel_spread":float(p.rel_spread),
        "iv":float(row.iv),"hv":float(row.hv),"vrp_ratio":float(row.vrp_ratio),
        "iv_rank":float(row.iv_rank) if np.isfinite(row.iv_rank) else None,
        "earnings_21d":bool(row.earnings_21d),"above200":bool(row.above200),
        "premium":premium,"intrinsic_loss":intrinsic,"pnl":pnl,
        "roc":pnl/collateral,"assigned":bool(close<float(p.strike)),
        "collateral":collateral
    }

def summarize(name,trades):
    d=pd.DataFrame(trades)
    if d.empty:return {"variant":name,"trades":0}
    wins=d[d.pnl>0];losses=d[d.pnl<0]
    gp=float(wins.pnl.sum());gl=float(-losses.pnl.sum())
    d["year"]=pd.to_datetime(d.entry).dt.year
    annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return {
        "variant":name,"trades":int(len(d)),"win_rate":float((d.pnl>0).mean()),
        "assignment_rate":float(d.assigned.mean()),
        "profit_factor":float(gp/gl) if gl>0 else None,
        "avg_pnl":float(d.pnl.mean()),"median_pnl":float(d.pnl.median()),
        "avg_roc":float(d.roc.mean()),"median_roc":float(d.roc.median()),
        "worst_trade":float(d.pnl.min()),"worst_roc":float(d.roc.min()),
        "gross_premium":float(d.premium.sum()),"net_pnl":float(d.pnl.sum()),
        "positive_years":int(sum(v>0 for v in annual.values())),"annual_pnl":annual,
        "avg_vrp_ratio":float(d.vrp_ratio.mean()),"avg_iv_rank":float(d.iv_rank.dropna().mean()) if d.iv_rank.notna().any() else None
    }

def main():
    vols={};stocks={};earnings={}
    for i,sym in enumerate(UNIVERSE,1):
        print(f"LOAD {i}/{len(UNIVERSE)} {sym}",flush=True)
        try:vols[sym]=load_vol(sym)
        except Exception as e:print("VOL_WARN",sym,repr(e),flush=True);vols[sym]=pd.DataFrame()
        try:stocks[sym]=load_stock(sym)
        except Exception as e:print("STOCK_WARN",sym,repr(e),flush=True);stocks[sym]=pd.DataFrame()
        try:earnings[sym]=load_earnings(sym)
        except Exception as e:print("EARN_WARN",sym,repr(e),flush=True);earnings[sym]=pd.DataFrame()
    if stocks.get("AAPL",pd.DataFrame()).empty:
        raise RuntimeError("AAPL stock history unavailable; cannot construct weekly calendar.")
    cand=build_candidates(vols,stocks,earnings)
    cand.to_csv(OUT/"candidate_panel.csv",index=False)
    sel=selections(cand)
    sel.to_csv(OUT/"weekly_selections.csv",index=False)
    print("SELECTION_ROWS",len(sel),flush=True)
    chains={}
    alltr=[];reports=[]
    for variant in sorted(sel.variant.unique()):
        rows=sel[sel.variant.eq(variant)].sort_values("date")
        base=[];stress=[]
        for n,(_,r) in enumerate(rows.iterrows(),1):
            if n%20==0:print("TRADE_PROGRESS",variant,n,len(rows),flush=True)
            t=trade_one(r,chains,stocks,False)
            if t:base.append(t);alltr.append(t)
            ts=trade_one(r,chains,stocks,True)
            if ts:stress.append(ts);alltr.append(ts)
        m=summarize(variant,base);ms=summarize(variant+"_stress",stress)
        m["stress_trades"]=ms.get("trades",0)
        m["stress_profit_factor"]=ms.get("profit_factor")
        m["stress_avg_pnl"]=ms.get("avg_pnl")
        m["stress_net_pnl"]=ms.get("net_pnl")
        m["stress_positive_years"]=ms.get("positive_years",0)
        m["passes_gate"]=bool(
            m.get("trades",0)>=70 and
            (m.get("profit_factor") or 0)>=1.25 and
            (m.get("avg_pnl") or -1)>0 and
            m.get("positive_years",0)>=2 and
            (m.get("stress_profit_factor") or 0)>=1.10 and
            (m.get("stress_avg_pnl") or -1)>0 and
            m.get("stress_positive_years",0)>=2
        )
        reports.append(m);print("REPORT",json.dumps(m),flush=True)
    pd.DataFrame(alltr).to_csv(OUT/"trades.csv",index=False)
    pd.DataFrame(reports).to_csv(OUT/"validation_summary.csv",index=False)
    eligible=[r["variant"] for r in reports if r.get("passes_gate")]
    summary={
        "name":"MOTU — Master of the Universe / Market Options Tactical Underwriter",
        "protocol":{"feature_history":"2019-2020 + trailing fields as available","validation":["2021-01-01","2022-12-31"],"holdout":HOLDOUT,
                    "universe":UNIVERSE,"target_dte":TARGET_DTE,"dte_range":[DTE_MIN,DTE_MAX],"target_delta":TARGET_DELTA,
                    "entry":"historical bid","stress":"bid minus $0.05 and doubled commission",
                    "gate":{"min_trades":70,"pf":1.25,"positive_years":2,"stress_pf":1.10,"stress_positive_years":2}},
        "validation":reports,"eligible_for_holdout":eligible,"holdout_opened":False,
        "chain_queries_cached":len(chains)
    }
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_MOTU_V01_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_MOTU_V01_END")

if __name__=="__main__":
    main()
