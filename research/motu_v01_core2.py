from __future__ import annotations
import json, os, time, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import pandas as pd
import requests

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v01_core2_results")); OUT.mkdir(parents=True,exist_ok=True)
API="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
START=pd.Timestamp("2021-01-01"); END=pd.Timestamp("2022-12-31")
DTE_MIN,DTE_MAX,TARGET_DTE=7,21,14
TARGET_DELTA=-0.20
COMMISSION=0.65
STRESS_PENALTY=0.05
HEAD={"User-Agent":"MOTU-research/0.1-core2"}
MAX_WORKERS=12

_lock=threading.Lock()
def log(*a):
    with _lock:
        print(*a,flush=True)

def sql(query,tries=3,timeout=30):
    last=None
    for i in range(tries):
        try:
            r=requests.get(API,params={"q":query},headers=HEAD,timeout=timeout)
            r.raise_for_status()
            j=r.json()
            if j.get("query_execution_status")!="Success":
                raise RuntimeError(j.get("query_execution_message","query failed"))
            return pd.DataFrame(j.get("rows",[]))
        except Exception as e:
            last=e
            time.sleep(0.6*(i+1))
    raise RuntimeError(f"{last}")

SYMS=",".join("'"+s+"'" for s in UNIVERSE)

def snapshot(date):
    q=f"""SELECT date,act_symbol,hv_current,hv_year_high,hv_year_low,iv_current,iv_year_high,iv_year_low
           FROM volatility_history
           WHERE date='{date.date()}' AND act_symbol IN ({SYMS})"""
    d=sql(q,timeout=20)
    if d.empty:return d
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:
        d[c]=pd.to_numeric(d[c],errors="coerce")
    d=d.dropna(subset=["hv_current","iv_current"])
    d=d[d.hv_current>0].copy()
    den=d.iv_year_high-d.iv_year_low
    d["iv_rank"]=((d.iv_current-d.iv_year_low)/den).where(den>1e-9).clip(0,1)
    d["vrp_ratio"]=d.iv_current/d.hv_current
    d["vrp_pct"]=d.vrp_ratio.rank(pct=True)
    fill=d.iv_rank.median() if d.iv_rank.notna().any() else 0.5
    d["ivrank_pct"]=d.iv_rank.fillna(fill).rank(pct=True)
    d["composite"]=0.65*d.vrp_pct+0.35*d.ivrank_pct
    return d

def get_week_snapshot(period):
    monday=period.start_time
    for k in range(5):
        d=monday+pd.Timedelta(days=k)
        if d<START or d>END:continue
        try:
            z=snapshot(d)
            if len(z)>=4:return d,z
        except Exception as e:
            pass
    return None

def chain(sym,date):
    lo=(date+pd.Timedelta(days=DTE_MIN)).date()
    hi=(date+pd.Timedelta(days=DTE_MAX)).date()
    q=f"""SELECT date,expiration,strike,call_put,bid,ask,vol,delta
           FROM option_chain
           WHERE date='{date.date()}' AND act_symbol='{sym}'
           AND expiration>='{lo}' AND expiration<='{hi}'
           ORDER BY expiration,strike,call_put
           LIMIT 5000"""
    d=sql(q,timeout=25)
    if d.empty:return d
    d["date"]=pd.to_datetime(d.date);d["expiration"]=pd.to_datetime(d.expiration)
    for c in ["strike","bid","ask","vol","delta"]:
        d[c]=pd.to_numeric(d[c],errors="coerce")
    d["dte"]=(d.expiration-d.date).dt.days
    return d

def choose_put(ch):
    if ch.empty:return None
    cp=ch.call_put.astype(str).str.lower()
    calls=ch[cp.str.startswith("c") & ch.delta.between(.35,.65)].copy()
    if calls.empty:return None
    calls["score"]=(calls.delta-.5).abs()+(calls.dte-TARGET_DTE).abs()/TARGET_DTE
    spot_proxy=float(calls.sort_values("score").iloc[0].strike)
    puts=ch[cp.str.startswith("p")].copy()
    puts=puts[
        puts.delta.between(-.45,-.03)&
        puts.dte.between(DTE_MIN,DTE_MAX)&
        (puts.strike<spot_proxy)&
        (puts.bid>=.05)&
        (puts.ask>=puts.bid)
    ]
    if puts.empty:return None
    puts["score"]=(puts.delta-TARGET_DELTA).abs()*5+(puts.dte-TARGET_DTE).abs()/TARGET_DTE
    return puts.sort_values("score").iloc[0]

def exit_quote(sym,exp,strike):
    lo=(exp-pd.Timedelta(days=4)).date()
    q=f"""SELECT date,bid,ask,call_put
           FROM option_chain
           WHERE date>='{lo}' AND date<='{exp.date()}'
           AND act_symbol='{sym}' AND expiration='{exp.date()}'
           AND strike={strike:.2f}
           ORDER BY date DESC LIMIT 30"""
    d=sql(q,timeout=25)
    if d.empty:return None
    d=d[d.call_put.astype(str).str.lower().str.startswith("p")].copy()
    if d.empty:return None
    d["date"]=pd.to_datetime(d.date);d["ask"]=pd.to_numeric(d.ask,errors="coerce")
    d=d.dropna(subset=["ask"]).sort_values("date",ascending=False)
    return None if d.empty else d.iloc[0]

def fetch_contract(sel):
    date=pd.Timestamp(sel["date"]);sym=sel["symbol"]
    try:
        ch=chain(sym,date);p=choose_put(ch)
        if p is None:return None
        ex=exit_quote(sym,pd.Timestamp(p.expiration),float(p.strike))
        if ex is None:return None
        return {
            "date":date,"symbol":sym,"expiration":pd.Timestamp(p.expiration),
            "strike":float(p.strike),"delta":float(p.delta),"dte":int(p.dte),
            "entry_bid":float(p.bid),"entry_ask":float(p.ask),"exit_ask":float(ex.ask),
            "vrp_ratio":float(sel["vrp_ratio"]),
            "iv_rank":None if pd.isna(sel["iv_rank"]) else float(sel["iv_rank"])
        }
    except Exception as e:
        log("CONTRACT_WARN",date.date(),sym,repr(e))
        return None

def make_trade(c,variant,stress=False):
    credit=max(0,c["entry_bid"]-(STRESS_PENALTY if stress else 0))
    debit=max(0,c["exit_ask"])
    fee_mult=2 if stress else 1
    pnl=(credit-debit)*100 - COMM*2*fee_mult
    collateral=max(1,c["strike"]*100-credit*100)
    return {
        "variant":variant+("_stress" if stress else ""),
        "entry":str(c["date"].date()),"symbol":c["symbol"],
        "expiration":str(c["expiration"].date()),"strike":c["strike"],
        "delta":c["delta"],"dte":c["dte"],"entry_bid":c["entry_bid"],
        "exit_ask":c["exit_ask"],"pnl":pnl,"roc":pnl/collateral,
        "vrp_ratio":c["vrp_ratio"],"iv_rank":c["iv_rank"]
    }

def summarize(name,arr):
    d=pd.DataFrame(arr)
    if d.empty:return {"variant":name,"trades":0}
    gp=float(d.loc[d.pnl>0,"pnl"].sum());gl=float(-d.loc[d.pnl<0,"pnl"].sum())
    d["year"]=pd.to_datetime(d.entry).dt.year
    annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return {
        "variant":name,"trades":int(len(d)),"win_rate":float((d.pnl>0).mean()),
        "profit_factor":float(gp/gl) if gl>0 else None,
        "avg_pnl":float(d.pnl.mean()),"median_pnl":float(d.pnl.median()),
        "avg_roc":float(d.roc.mean()),"worst_trade":float(d.pnl.min()),
        "net_pnl":float(d.pnl.sum()),"positive_years":int(sum(v>0 for v in annual.values())),
        "annual_pnl":annual
    }

def main():
    weeks=list(pd.period_range(START,END,freq="W-SUN"))
    snapshots=[]
    log("SNAPSHOT_WEEKS",len(weeks))
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs=[ex.submit(get_week_snapshot,w) for w in weeks]
        for n,f in enumerate(as_completed(futs),1):
            r=f.result()
            if r:snapshots.append(r)
            if n%20==0:log("SNAP_PROGRESS",n,len(weeks),"usable",len(snapshots))
    snapshots=sorted(snapshots,key=lambda x:x[0])
    log("USABLE_WEEKS",len(snapshots))

    selections=[]
    for date,z in snapshots:
        a=z.sort_values("vrp_ratio",ascending=False).iloc[0]
        selections.append({"date":date,"symbol":str(a.act_symbol),"variant":"vrp","vrp_ratio":float(a.vrp_ratio),"iv_rank":a.iv_rank})
        b=z.sort_values(["composite","vrp_ratio"],ascending=False).iloc[0]
        selections.append({"date":date,"symbol":str(b.act_symbol),"variant":"vrp_ivrank","vrp_ratio":float(b.vrp_ratio),"iv_rank":b.iv_rank})
    pd.DataFrame(selections).to_csv(OUT/"selections.csv",index=False)

    # Fetch each date/symbol pair once, then reuse for both selectors and stress.
    uniq={}
    for s in selections:
        uniq[(str(pd.Timestamp(s["date"]).date()),s["symbol"])]=s
    log("UNIQUE_CONTRACT_KEYS",len(uniq))
    contracts={}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        fmap={ex.submit(fetch_contract,s):k for k,s in uniq.items()}
        for n,f in enumerate(as_completed(fmap),1):
            c=f.result()
            if c is not None:contracts[fmap[f]]=c
            if n%20==0:log("CHAIN_PROGRESS",n,len(fmap),"usable",len(contracts))

    alltr=[];reports=[]
    for variant in ["vrp","vrp_ivrank"]:
        base=[];stress=[]
        for s in selections:
            if s["variant"]!=variant:continue
            key=(str(pd.Timestamp(s["date"]).date()),s["symbol"])
            c=contracts.get(key)
            if not c:continue
            # Preserve selector-specific feature values even if same contract selected by two variants.
            c2=dict(c);c2["vrp_ratio"]=float(s["vrp_ratio"]);c2["iv_rank"]=None if pd.isna(s["iv_rank"]) else float(s["iv_rank"])
            a=make_trade(c2,variant,False);b=make_trade(c2,variant,True)
            base.append(a);stress.append(b);alltr.extend([a,b])
        m=summarize(variant,base);ms=summarize(variant+"_stress",stress)
        m.update({
            "stress_trades":ms.get("trades",0),
            "stress_profit_factor":ms.get("profit_factor"),
            "stress_avg_pnl":ms.get("avg_pnl"),
            "stress_net_pnl":ms.get("net_pnl"),
            "stress_positive_years":ms.get("positive_years",0)
        })
        m["passes_gate"]=bool(
            m.get("trades",0)>=70 and
            (m.get("profit_factor") or 0)>=1.25 and
            (m.get("avg_pnl") or -1)>0 and
            m.get("positive_years",0)>=2 and
            (m.get("stress_profit_factor") or 0)>=1.10 and
            (m.get("stress_avg_pnl") or -1)>0 and
            m.get("stress_positive_years",0)>=2
        )
        reports.append(m);log("REPORT",json.dumps(m))

    pd.DataFrame(alltr).to_csv(OUT/"trades.csv",index=False)
    pd.DataFrame(reports).to_csv(OUT/"validation_summary.csv",index=False)
    summary={
        "name":"MOTU v0.1 core2 exact-date validation",
        "validation":["2021-01-01","2022-12-31"],
        "holdout":"2023-2025 SEALED",
        "usable_weeks":len(snapshots),"unique_contracts":len(contracts),
        "reports":reports,
        "eligible":[r["variant"] for r in reports if r.get("passes_gate")],
        "holdout_opened":False
    }
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    log("FINAL_MOTU_CORE2_BEGIN")
    log(json.dumps(summary,indent=2))
    log("FINAL_MOTU_CORE2_END")

if __name__=="__main__":
    main()
