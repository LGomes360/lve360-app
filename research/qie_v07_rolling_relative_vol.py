from __future__ import annotations
import json, math, os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple, List

import numpy as np
import pandas as pd

VAL_START=pd.Timestamp("2018-01-02")
VAL_END=pd.Timestamp("2022-12-30")
MULT=100.0
COMM=0.65
MIN_OI=100
MAX_HOLD=15
EXIT_Z=0.25
BASE_HEDGE_BPS=1.0
STRESS_HEDGE_BPS=2.0
BASE_OPT_PENALTY=0.0
STRESS_OPT_PENALTY=0.02
WINDOWS=[126,252]
THRESHOLDS=[1.25,1.50,1.75]

ROOT=Path(os.environ.get("QIE_DATA_ROOT","/tmp/options-dataset"))
OUT=Path(os.environ.get("QIE_OUT_DIR","qie_v07_results")); OUT.mkdir(parents=True,exist_ok=True)

@dataclass
class Leg:
    ticker:str
    cid:str
    sign:int
    qty:int
    expiration:pd.Timestamp

def load_under(t):
    u=pd.read_parquet(ROOT/t.lower()/"underlying_prices.parquet")
    u["date"]=pd.to_datetime(u.date)
    return u.sort_values("date").drop_duplicates("date").set_index("date")

def load_opts(t):
    cols=["contract_id","expiration","strike","type","bid","ask","bid_size","ask_size","open_interest","date","implied_volatility","delta","vega"]
    parts=[]
    for y in range(2017,2023):
        p=ROOT/t.lower()/f"options_{y}.parquet"
        if not p.exists(): continue
        print("LOAD",t,y,flush=True)
        d=pd.read_parquet(p,columns=cols)
        d["date"]=pd.to_datetime(d.date); d["expiration"]=pd.to_datetime(d.expiration); d["type"]=d.type.astype(str).str.lower()
        d["dte"]=(d.expiration-d.date).dt.days
        for c in ["strike","bid","ask","bid_size","ask_size","open_interest","implied_volatility","delta","vega"]:
            d[c]=pd.to_numeric(d[c],errors="coerce")
        d=d.dropna(subset=["contract_id","expiration","date","strike","bid","ask","implied_volatility","delta","vega"])
        d=d[(d.dte.between(10,60))&(d.type.isin(["call","put"]))&(d.ask>=d.bid)&(d.bid>=0)&(d.ask>0)&(d.implied_volatility>0)&(d.vega>0)]
        d=d[(d.open_interest.fillna(0)>=MIN_OI)&(d.bid_size.fillna(0)>=1)&(d.ask_size.fillna(0)>=1)]
        parts.append(d)
    return pd.concat(parts,ignore_index=True).sort_values(["date","expiration","strike","type"])

def select_atm(day,target=42,lo=35,hi=50):
    e=day[day.dte.between(lo,hi)][["expiration","dte"]].drop_duplicates()
    if e.empty:return None
    e=e.assign(dist=(e.dte-target).abs())
    exp=pd.Timestamp(e.sort_values(["dist","dte"]).iloc[0].expiration)
    x=day[day.expiration.eq(exp)]
    c=x[(x.type=="call")&x.delta.between(.35,.65)].copy()
    p=x[(x.type=="put")&x.delta.between(-.65,-.35)].copy()
    if c.empty or p.empty:return None
    j=c.merge(p,on=["date","expiration","strike","dte"],suffixes=("_c","_p"))
    if j.empty:return None
    j["score"]=(j.delta_c-.5).abs()+(j.delta_p+.5).abs()
    r=j.sort_values("score").iloc[0]
    return dict(date=pd.Timestamp(r.date),expiration=pd.Timestamp(r.expiration),
                call_id=str(r.contract_id_c),put_id=str(r.contract_id_p),
                iv=float((r.implied_volatility_c+r.implied_volatility_p)/2),
                vega=float(r.vega_c+r.vega_p))

def daily_atm(opt):
    out={}
    for d,g in opt.groupby("date",sort=True):
        a=select_atm(g)
        if a is not None:out[d]=a
    return out

def quote_idx(opt):
    z=opt[(opt.date>=pd.Timestamp("2017-01-03"))&(opt.date<=VAL_END)].copy()
    return z.set_index(["date","contract_id"]).sort_index()

def getq(idx,d,cid):
    try:
        r=idx.loc[(d,cid)]
        return r.iloc[0] if isinstance(r,pd.DataFrame) else r
    except KeyError:return None

def spot(under,t,d):
    if d not in under[t].index:return None
    v=under[t].loc[d,"close"]
    return float(v) if np.isfinite(v) else None

def vega_match(va,vb,base_b=2):
    qb=base_b; qa=max(1,min(6,int(round(qb*vb/max(va,1e-9)))))
    return qa,qb

def entry_cash(legs,idx,d,pen):
    cash=0.0; gross=0.0
    for l in legs:
        r=getq(idx[l.ticker],d,l.cid)
        if r is None:return None,None
        px=float(r.ask if l.sign>0 else r.bid)
        cash += (-px if l.sign>0 else px)*MULT*l.qty - COMM*l.qty - pen*MULT*l.qty
        gross += abs(px*MULT*l.qty)
    return cash,gross

def exit_cash(legs,idx,d,pen):
    cash=0.0
    for l in legs:
        r=getq(idx[l.ticker],d,l.cid)
        if r is None:return None
        px=float(r.bid if l.sign>0 else r.ask)
        cash += (px if l.sign>0 else -px)*MULT*l.qty - COMM*l.qty - pen*MULT*l.qty
    return cash

def deltas(legs,idx,d):
    out={}
    for l in legs:
        r=getq(idx[l.ticker],d,l.cid)
        if r is None:return None
        out[l.ticker]=out.get(l.ticker,0.0)+l.sign*l.qty*float(r.delta)*MULT
    return out

def simulate(legs,entry,exit_date,dates,idx,under,hedge_bps,pen):
    ec,gross=entry_cash(legs,idx,entry,pen)
    if ec is None:return None
    de=deltas(legs,idx,entry)
    if de is None:return None
    hedges={}; prev={}; hpnl=0.0; hcost=0.0
    for t,x in de.items():
        s=spot(under,t,entry)
        if s is None:return None
        hedges[t]=-x; prev[t]=s; hcost+=abs(hedges[t])*s*hedge_bps/10000
    for d in dates:
        if d<=entry or d>exit_date:continue
        for t in list(hedges):
            s=spot(under,t,d)
            if s is None:continue
            hpnl += hedges[t]*(s-prev[t]); prev[t]=s
        nd=deltas(legs,idx,d)
        if nd is not None and d<exit_date:
            for t in hedges:
                target=-nd.get(t,0.0); ch=target-hedges[t]
                hcost+=abs(ch)*prev[t]*hedge_bps/10000; hedges[t]=target
    xc=exit_cash(legs,idx,exit_date,pen)
    if xc is None:return None
    for t,h in hedges.items(): hcost+=abs(h)*prev[t]*hedge_bps/10000
    pnl=ec+xc+hpnl-hcost
    return dict(pnl=float(pnl),hedge_pnl=float(hpnl),hedge_cost=float(hcost),gross_premium=float(gross),
                norm=float(pnl/max(gross,1.0)))

def summarize(name,trades):
    d=pd.DataFrame(trades)
    if d.empty:return dict(strategy=name,trades=0)
    w=d[d.pnl>0]; l=d[d.pnl<0]; gp=w.pnl.sum(); gl=-l.pnl.sum()
    d["year"]=pd.to_datetime(d.entry).dt.year
    annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return dict(strategy=name,trades=int(len(d)),win_rate=float(len(w)/len(d)),
                profit_factor=float(gp/gl) if gl>0 else None,avg_pnl=float(d.pnl.mean()),
                median_pnl=float(d.pnl.median()),total_pnl=float(d.pnl.sum()),
                worst_trade=float(d.pnl.min()),avg_norm=float(d.norm.mean()),
                positive_years=int(sum(v>0 for v in annual.values())),annual_pnl=annual)

def run_pair(other,window,thr,atm,idx,under,hedge_bps,pen):
    common=sorted(set(atm["SPY"])&set(atm[other]))
    rows=[]
    for d in common:
        rows.append((d,math.log(atm[other][d]["iv"]/atm["SPY"][d]["iv"])))
    s=pd.Series({d:v for d,v in rows}).sort_index()
    mean=s.shift(1).rolling(window,min_periods=window).mean()
    std=s.shift(1).rolling(window,min_periods=window).std(ddof=1)
    z=(s-mean)/std
    dates=sorted(d for d in under["SPY"].index if pd.Timestamp("2017-01-03")<=d<=VAL_END)
    datepos={d:i for i,d in enumerate(dates)}
    trades=[]; blocked=None
    for d in z.index:
        if d<VAL_START or d>VAL_END or not np.isfinite(z.loc[d]) or abs(float(z.loc[d]))<thr:continue
        if blocked is not None and d<=blocked:continue
        if d not in datepos:continue
        direction=1 if z.loc[d]>0 else -1 # +1 other rich: short other/long SPY
        # dynamic exit: ratio mean reverts, sign flips, or MAX_HOLD
        exitd=None
        for nd in dates[datepos[d]+1:datepos[d]+MAX_HOLD+1]:
            zv=z.get(nd,np.nan)
            if np.isfinite(zv) and (abs(float(zv))<=EXIT_Z or np.sign(zv)!=np.sign(z.loc[d])):
                exitd=nd;break
        if exitd is None:
            cand=dates[datepos[d]+1:datepos[d]+MAX_HOLD+1]
            if not cand:continue
            exitd=cand[-1]
        a=atm["SPY"][d]; b=atm[other][d]
        qo,qs=vega_match(b["vega"],a["vega"],2)
        so=-1 if direction>0 else 1; ss=1 if direction>0 else -1
        legs=[Leg(other,b["call_id"],so,qo,b["expiration"]),Leg(other,b["put_id"],so,qo,b["expiration"]),
              Leg("SPY",a["call_id"],ss,qs,a["expiration"]),Leg("SPY",a["put_id"],ss,qs,a["expiration"])]
        tr=simulate(legs,d,exitd,dates[datepos[d]:datepos[exitd]+1],idx,under,hedge_bps,pen)
        if tr is None:continue
        tr.update(entry=str(d.date()),exit=str(exitd.date()),z=float(z.loc[d]),pair=f"{other}/SPY",
                  direction="short_other" if direction>0 else "long_other")
        trades.append(tr); blocked=exitd
    return summarize(f"{other.lower()}_spy_w{window}_z{thr}",trades),pd.DataFrame(trades)

def main():
    tickers=["SPY","QQQ","IWM"]
    under={t:load_under(t) for t in tickers}
    opts={t:load_opts(t) for t in tickers}
    atm={t:daily_atm(opts[t]) for t in tickers}
    idx={t:quote_idx(opts[t]) for t in tickers}
    rows=[]; pass_cells=[]
    for other in ["QQQ","IWM"]:
        for w in WINDOWS:
            for thr in THRESHOLDS:
                m,t=run_pair(other,w,thr,atm,idx,under,BASE_HEDGE_BPS,BASE_OPT_PENALTY)
                ms,ts=run_pair(other,w,thr,atm,idx,under,STRESS_HEDGE_BPS,STRESS_OPT_PENALTY)
                m.update(stress_profit_factor=ms.get("profit_factor"),stress_avg_pnl=ms.get("avg_pnl"),
                         stress_total_pnl=ms.get("total_pnl"),stress_positive_years=ms.get("positive_years"))
                passes=(m.get("trades",0)>=25 and (m.get("profit_factor") or 0)>=1.20 and
                        (m.get("avg_pnl") or -1)>0 and m.get("positive_years",0)>=3 and
                        (m.get("stress_profit_factor") or 0)>=1.05 and (m.get("stress_avg_pnl") or -1)>0 and
                        (m.get("stress_positive_years") or 0)>=3)
                m["passes_gate"]=bool(passes)
                rows.append(m)
                if passes:pass_cells.append(dict(other=other,window=w,threshold=thr))
                t.to_csv(OUT/f"{other.lower()}_w{w}_z{str(thr).replace('.','p')}.csv",index=False)
                print("CELL",json.dumps(m),flush=True)
    # Plateau requirement: at least 2 passing adjacent thresholds in same pair/window OR 3 total cells for pair.
    plateau=[]
    for other in ["QQQ","IWM"]:
        cells=[c for c in pass_cells if c["other"]==other]
        bywin={}
        for c in cells:bywin.setdefault(c["window"],[]).append(c["threshold"])
        adjacent=False
        for w,ths in bywin.items():
            ss=sorted(ths)
            for a,b in zip(ss,ss[1:]):
                if round(b-a,2)<=0.26:adjacent=True
        if adjacent or len(cells)>=3:plateau.append(other)
    summary=dict(
        protocol=dict(validation=[str(VAL_START.date()),str(VAL_END.date())],holdout="2023-2025 SEALED",
                      windows=WINDOWS,thresholds=THRESHOLDS,exit_z=EXIT_Z,max_hold=MAX_HOLD,
                      base_execution=dict(hedge_bps=BASE_HEDGE_BPS,option_penalty=BASE_OPT_PENALTY),
                      stress_execution=dict(hedge_bps=STRESS_HEDGE_BPS,option_penalty=STRESS_OPT_PENALTY),
                      gate="PF>=1.20, >=3 positive years, stressed PF>=1.05, >=3 stressed positive years; plateau required"),
        cells=rows,passing_cells=pass_cells,plateau_pairs=plateau,eligible_for_holdout=plateau,holdout_opened=False)
    pd.DataFrame(rows).to_csv(OUT/"validation_grid.csv",index=False)
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_V07_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_V07_END")

if __name__=="__main__":main()
