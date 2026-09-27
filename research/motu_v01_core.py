from __future__ import annotations
import json, math, os, time
from pathlib import Path
import numpy as np, pandas as pd, requests
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v01_core_results")); OUT.mkdir(parents=True,exist_ok=True)
API="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
START=pd.Timestamp("2021-01-01"); END=pd.Timestamp("2022-12-31")
DTE_MIN,DTE_MAX,TARGET_DTE=7,21,14
TARGET_DELTA=-.20; COMM=.65; STRESS=.05
HEAD={"User-Agent":"MOTU-research/0.1-core"}

def q(sql,tries=3):
    last=None
    for i in range(tries):
        try:
            r=requests.get(API,params={"q":sql},headers=HEAD,timeout=25);r.raise_for_status();j=r.json()
            if j.get("query_execution_status")!="Success":raise RuntimeError(j.get("query_execution_message"))
            return pd.DataFrame(j.get("rows",[]))
        except Exception as e:
            last=e;time.sleep(.5*(i+1))
    raise RuntimeError(last)

symlist=",".join("'"+s+"'" for s in UNIVERSE)

def snapshot(date):
    d=date.date()
    sql=f"""SELECT date,act_symbol,hv_current,hv_year_high,hv_year_low,iv_current,iv_year_high,iv_year_low
             FROM volatility_history WHERE date='{d}' AND act_symbol IN ({symlist})"""
    z=q(sql)
    if z.empty:return z
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:
        z[c]=pd.to_numeric(z[c],errors="coerce")
    z=z.dropna(subset=["hv_current","iv_current"])
    z=z[z.hv_current>0].copy()
    den=z.iv_year_high-z.iv_year_low
    z["iv_rank"]=((z.iv_current-z.iv_year_low)/den).where(den>1e-9)
    z["iv_rank"]=z.iv_rank.clip(0,1)
    z["vrp_ratio"]=z.iv_current/z.hv_current
    z["vrp_pct"]=z.vrp_ratio.rank(pct=True)
    z["ivrank_pct"]=z.iv_rank.fillna(z.iv_rank.median()).rank(pct=True)
    z["composite"]=.65*z.vrp_pct+.35*z.ivrank_pct
    return z

def weekly_trade_dates():
    weeks=pd.period_range(START,END,freq="W-SUN")
    out=[]
    for w in weeks:
        monday=w.start_time
        found=None
        for k in range(5):
            d=monday+pd.Timedelta(days=k)
            if d<START or d>END:continue
            try:z=snapshot(d)
            except Exception as e:continue
            if len(z)>=4:
                found=(d,z);break
        if found:out.append(found)
    return out

def chain(sym,date):
    lo=(date+pd.Timedelta(days=DTE_MIN)).date();hi=(date+pd.Timedelta(days=DTE_MAX)).date()
    sql=f"""SELECT date,expiration,strike,call_put,bid,ask,vol,delta
             FROM option_chain WHERE date='{date.date()}' AND act_symbol='{sym}'
             AND expiration>='{lo}' AND expiration<='{hi}' ORDER BY expiration,strike,call_put LIMIT 5000"""
    z=q(sql)
    if z.empty:return z
    z["date"]=pd.to_datetime(z.date);z["expiration"]=pd.to_datetime(z.expiration)
    for c in ["strike","bid","ask","vol","delta"]:z[c]=pd.to_numeric(z[c],errors="coerce")
    z["dte"]=(z.expiration-z.date).dt.days
    return z

def choose(ch):
    if ch.empty:return None
    # infer spot from nearest-to-0.50 call strike; robust enough for identifying OTM puts
    calls=ch[ch.call_put.astype(str).str.lower().str.startswith("c") & ch.delta.between(.35,.65)].copy()
    if calls.empty:return None
    calls["z"]=(calls.delta-.5).abs()+(calls.dte-TARGET_DTE).abs()/TARGET_DTE
    spot_proxy=float(calls.sort_values("z").iloc[0].strike)
    puts=ch[ch.call_put.astype(str).str.lower().str.startswith("p")].copy()
    puts=puts[puts.delta.between(-.45,-.03)&puts.dte.between(DTE_MIN,DTE_MAX)&(puts.strike<spot_proxy)&(puts.bid>=.05)&(puts.ask>=puts.bid)]
    if puts.empty:return None
    puts["z"]=(puts.delta-TARGET_DELTA).abs()*5+(puts.dte-TARGET_DTE).abs()/TARGET_DTE
    r=puts.sort_values("z").iloc[0]
    return r

def exit_quote(sym,exp,strike):
    lo=(exp-pd.Timedelta(days=4)).date()
    sql=f"""SELECT date,bid,ask FROM option_chain
             WHERE date>='{lo}' AND date<='{exp.date()}' AND act_symbol='{sym}'
             AND expiration='{exp.date()}' AND strike={strike:.2f} AND call_put='P'
             ORDER BY date DESC LIMIT 1"""
    z=q(sql)
    if z.empty:
        # Some snapshots encode call_put differently; retry case-insensitively.
        sql=f"""SELECT date,bid,ask,call_put FROM option_chain
                 WHERE date>='{lo}' AND date<='{exp.date()}' AND act_symbol='{sym}'
                 AND expiration='{exp.date()}' AND strike={strike:.2f}
                 ORDER BY date DESC LIMIT 20"""
        z=q(sql)
        if z.empty:return None
        z=z[z.call_put.astype(str).str.lower().str.startswith("p")]
        if z.empty:return None
    z["date"]=pd.to_datetime(z.date);z["ask"]=pd.to_numeric(z.ask,errors="coerce")
    z=z.dropna(subset=["ask"]).sort_values("date",ascending=False)
    return None if z.empty else z.iloc[0]

def run_trade(sel,variant,stress=False):
    date=pd.Timestamp(sel["date"]);sym=str(sel["symbol"])
    ch=chain(sym,date);p=choose(ch)
    if p is None:return None
    x=exit_quote(sym,pd.Timestamp(p.expiration),float(p.strike))
    if x is None:return None
    credit=max(0,float(p.bid)-(STRESS if stress else 0))
    debit=max(0,float(x.ask))
    pnl=(credit-debit)*100-COMM*(2 if stress else 1)*2
    maxrisk=max(1,float(p.strike)*100-credit*100)
    return dict(variant=variant+("_stress" if stress else ""),entry=str(date.date()),symbol=sym,
                expiration=str(pd.Timestamp(p.expiration).date()),strike=float(p.strike),delta=float(p.delta),
                dte=int(p.dte),entry_bid=float(p.bid),exit_ask=debit,pnl=pnl,roc=pnl/maxrisk,
                vrp_ratio=float(sel["vrp_ratio"]),iv_rank=None if pd.isna(sel["iv_rank"]) else float(sel["iv_rank"]))

def summarize(name,arr):
    d=pd.DataFrame(arr)
    if d.empty:return {"variant":name,"trades":0}
    w=d[d.pnl>0];l=d[d.pnl<0];gp=w.pnl.sum();gl=-l.pnl.sum()
    d["year"]=pd.to_datetime(d.entry).dt.year;annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return dict(variant=name,trades=len(d),win_rate=float((d.pnl>0).mean()),profit_factor=float(gp/gl) if gl>0 else None,
                avg_pnl=float(d.pnl.mean()),median_pnl=float(d.pnl.median()),avg_roc=float(d.roc.mean()),
                worst=float(d.pnl.min()),net_pnl=float(d.pnl.sum()),positive_years=sum(v>0 for v in annual.values()),annual_pnl=annual)

def main():
    print("BUILD_WEEKLY_SNAPSHOTS",flush=True)
    weeks=weekly_trade_dates();print("WEEKS",len(weeks),flush=True)
    selections=[]
    for date,z in weeks:
        r=z.sort_values("vrp_ratio",ascending=False).iloc[0]
        selections.append(dict(date=date,symbol=r.act_symbol,variant="vrp",vrp_ratio=r.vrp_ratio,iv_rank=r.iv_rank))
        r=z.sort_values(["composite","vrp_ratio"],ascending=False).iloc[0]
        selections.append(dict(date=date,symbol=r.act_symbol,variant="vrp_ivrank",vrp_ratio=r.vrp_ratio,iv_rank=r.iv_rank))
    pd.DataFrame(selections).to_csv(OUT/"selections.csv",index=False)
    reports=[];alltr=[]
    for variant in ["vrp","vrp_ivrank"]:
        rows=[x for x in selections if x["variant"]==variant]
        base=[];stress=[]
        # endpoint is public; modest concurrency
        def both(x):
            try:return run_trade(x,variant,False),run_trade(x,variant,True)
            except Exception as e:
                print("TRADE_WARN",x["date"],x["symbol"],repr(e),flush=True);return None,None
        with ThreadPoolExecutor(max_workers=5) as ex:
            futs=[ex.submit(both,x) for x in rows]
            for n,f in enumerate(as_completed(futs),1):
                a,b=f.result()
                if a:base.append(a);alltr.append(a)
                if b:stress.append(b);alltr.append(b)
                if n%20==0:print("PROGRESS",variant,n,len(rows),flush=True)
        m=summarize(variant,base);ms=summarize(variant+"_stress",stress)
        m.update(stress_trades=ms.get("trades",0),stress_profit_factor=ms.get("profit_factor"),
                 stress_avg_pnl=ms.get("avg_pnl"),stress_net_pnl=ms.get("net_pnl"),stress_positive_years=ms.get("positive_years",0))
        m["passes_gate"]=bool(m.get("trades",0)>=70 and (m.get("profit_factor") or 0)>=1.25 and m.get("positive_years",0)>=2
             and (m.get("avg_pnl") or -1)>0 and (m.get("stress_profit_factor") or 0)>=1.10
             and (m.get("stress_avg_pnl") or -1)>0 and m.get("stress_positive_years",0)>=2)
        reports.append(m);print("REPORT",json.dumps(m),flush=True)
    pd.DataFrame(alltr).to_csv(OUT/"trades.csv",index=False)
    summary={"name":"MOTU v0.1 core exact-date diagnostic","validation":["2021-01-01","2022-12-31"],
             "holdout":"2023-2025 SEALED","reports":reports,
             "eligible":[r["variant"] for r in reports if r.get("passes_gate")],"holdout_opened":False}
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_MOTU_CORE_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_MOTU_CORE_END")
if __name__=="__main__":main()
