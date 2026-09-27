from __future__ import annotations
import json, os, time, calendar
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np, pandas as pd, requests

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v01_turbo_results"));OUT.mkdir(parents=True,exist_ok=True)
API="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
SYMS=",".join("'"+x+"'" for x in UNIVERSE)
START=pd.Timestamp("2021-01-01");END=pd.Timestamp("2022-12-31")
DTE_MIN,DTE_MAX,TARGET_DTE=7,21,14;TARGET_DELTA=-.20;COMM=.65;STRESS=.05
H={"User-Agent":"MOTU-research/0.1-turbo"}

def q(sql,tries=3,timeout=30):
    last=None
    for i in range(tries):
        try:
            r=requests.get(API,params={"q":sql},headers=H,timeout=timeout);r.raise_for_status();j=r.json()
            if j.get("query_execution_status")!="Success":raise RuntimeError(j.get("query_execution_message"))
            return pd.DataFrame(j.get("rows",[]))
        except Exception as e:
            last=e;time.sleep(.35*(i+1))
    raise RuntimeError(last)

def month_bounds(y,m):
    s=pd.Timestamp(y,m,1);e=(s+pd.offsets.MonthBegin(1));return s,e
def vol_month(y,m):
    s,e=month_bounds(y,m)
    sql=f"""SELECT date,act_symbol,hv_current,hv_year_high,hv_year_low,iv_current,iv_year_high,iv_year_low
             FROM volatility_history WHERE date>='{s.date()}' AND date<'{e.date()}'
             AND act_symbol IN ({SYMS}) ORDER BY date,act_symbol"""
    z=q(sql)
    if z.empty:return z
    z["date"]=pd.to_datetime(z.date)
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:z[c]=pd.to_numeric(z[c],errors="coerce")
    return z

def load_vol():
    parts=[]
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs={ex.submit(vol_month,y,m):(y,m) for y in [2021,2022] for m in range(1,13)}
        for f in as_completed(futs):
            ym=futs[f]
            try:
                z=f.result()
                if not z.empty:parts.append(z)
                print("VOL_MONTH",ym,len(z),flush=True)
            except Exception as e:print("VOL_MONTH_WARN",ym,repr(e),flush=True)
    if not parts:return pd.DataFrame()
    return pd.concat(parts,ignore_index=True).sort_values(["date","act_symbol"])

def weekly_selections(v):
    v=v.dropna(subset=["hv_current","iv_current"]).copy();v=v[v.hv_current>0]
    den=v.iv_year_high-v.iv_year_low
    v["iv_rank"]=((v.iv_current-v.iv_year_low)/den).where(den>1e-9).clip(0,1)
    v["vrp_ratio"]=v.iv_current/v.hv_current
    v["week"]=v.date.dt.to_period("W-SUN")
    rows=[]
    for wk,g in v.groupby("week"):
        date=g.date.min();x=g[g.date.eq(date)].copy()
        if len(x)<4:continue
        x["vrp_pct"]=x.vrp_ratio.rank(pct=True)
        x["ivrank_pct"]=x.iv_rank.fillna(x.iv_rank.median()).rank(pct=True)
        x["composite"]=.65*x.vrp_pct+.35*x.ivrank_pct
        a=x.sort_values(["vrp_ratio","iv_rank"],ascending=False).iloc[0]
        b=x.sort_values(["composite","vrp_ratio"],ascending=False).iloc[0]
        rows += [
          dict(date=date,symbol=str(a.act_symbol),variant="vrp",vrp_ratio=float(a.vrp_ratio),iv_rank=None if pd.isna(a.iv_rank) else float(a.iv_rank)),
          dict(date=date,symbol=str(b.act_symbol),variant="vrp_ivrank",vrp_ratio=float(b.vrp_ratio),iv_rank=None if pd.isna(b.iv_rank) else float(b.iv_rank))
        ]
    return pd.DataFrame(rows)

def entry_chain(date,syms):
    lo=(date+pd.Timedelta(days=DTE_MIN)).date();hi=(date+pd.Timedelta(days=DTE_MAX)).date()
    ss=",".join("'"+s+"'" for s in sorted(set(syms)))
    sql=f"""SELECT date,act_symbol,expiration,strike,call_put,bid,ask,vol,delta
             FROM option_chain WHERE date='{date.date()}' AND act_symbol IN ({ss})
             AND expiration>='{lo}' AND expiration<='{hi}'
             ORDER BY act_symbol,expiration,strike,call_put LIMIT 10000"""
    z=q(sql)
    if z.empty:return z
    z["date"]=pd.to_datetime(z.date);z["expiration"]=pd.to_datetime(z.expiration)
    for c in ["strike","bid","ask","vol","delta"]:z[c]=pd.to_numeric(z[c],errors="coerce")
    z["dte"]=(z.expiration-z.date).dt.days
    return z

def choose_put(ch,sym):
    if ch is None or ch.empty or "act_symbol" not in ch.columns:
        return None
    x=ch[ch.act_symbol.eq(sym)]
    calls=x[x.call_put.astype(str).str.lower().str.startswith("c")&x.delta.between(.35,.65)].copy()
    if calls.empty:return None
    calls["z"]=(calls.delta-.5).abs()+(calls.dte-TARGET_DTE).abs()/TARGET_DTE
    spot=float(calls.sort_values("z").iloc[0].strike)
    p=x[x.call_put.astype(str).str.lower().str.startswith("p")].copy()
    p=p[p.delta.between(-.45,-.03)&p.dte.between(DTE_MIN,DTE_MAX)&(p.strike<spot)&(p.bid>=.05)&(p.ask>=p.bid)]
    if p.empty:return None
    p["z"]=(p.delta-TARGET_DELTA).abs()*5+(p.dte-TARGET_DTE).abs()/TARGET_DTE
    return p.sort_values("z").iloc[0]

def exit_one(spec):
    sym,exp,strike=spec
    lo=(exp-pd.Timedelta(days=4)).date()
    sql=f"""SELECT date,bid,ask,call_put FROM option_chain
             WHERE date>='{lo}' AND date<='{exp.date()}' AND act_symbol='{sym}'
             AND expiration='{exp.date()}' AND strike={strike:.2f}
             ORDER BY date DESC LIMIT 20"""
    z=q(sql)
    if z.empty:return spec,None
    z=z[z.call_put.astype(str).str.lower().str.startswith("p")].copy()
    if z.empty:return spec,None
    z["date"]=pd.to_datetime(z.date);z["ask"]=pd.to_numeric(z.ask,errors="coerce")
    z=z.dropna(subset=["ask"]).sort_values("date",ascending=False)
    return spec,(None if z.empty else z.iloc[0])

def summarize(name,arr):
    d=pd.DataFrame(arr)
    if d.empty:return {"variant":name,"trades":0}
    w=d[d.pnl>0];l=d[d.pnl<0];gp=w.pnl.sum();gl=-l.pnl.sum()
    d["year"]=pd.to_datetime(d.entry).dt.year;annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return dict(variant=name,trades=int(len(d)),win_rate=float((d.pnl>0).mean()),
      profit_factor=float(gp/gl) if gl>0 else None,avg_pnl=float(d.pnl.mean()),median_pnl=float(d.pnl.median()),
      avg_roc=float(d.roc.mean()),worst=float(d.pnl.min()),net_pnl=float(d.pnl.sum()),
      positive_years=int(sum(v>0 for v in annual.values())),annual_pnl=annual)

def main():
    v=load_vol()
    if v.empty:raise RuntimeError("No volatility data")
    sel=weekly_selections(v);sel.to_csv(OUT/"selections.csv",index=False);print("SELECTIONS",len(sel),flush=True)
    groups={pd.Timestamp(d):g.symbol.tolist() for d,g in sel.groupby("date")}
    chains={}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs={ex.submit(entry_chain,d,ss):d for d,ss in groups.items()}
        for n,f in enumerate(as_completed(futs),1):
            d=futs[f]
            try:chains[d]=f.result()
            except Exception as e:print("ENTRY_WARN",d,repr(e),flush=True);chains[d]=pd.DataFrame()
            if n%20==0:print("ENTRY_PROGRESS",n,len(futs),flush=True)
    entries=[]
    for _,r in sel.iterrows():
        p=choose_put(chains.get(pd.Timestamp(r.date),pd.DataFrame()),str(r.symbol))
        if p is None:continue
        entries.append(dict(variant=r.variant,entry=pd.Timestamp(r.date),symbol=str(r.symbol),vrp_ratio=float(r.vrp_ratio),
          iv_rank=r.iv_rank,expiration=pd.Timestamp(p.expiration),strike=float(p.strike),delta=float(p.delta),dte=int(p.dte),
          bid=float(p.bid),ask=float(p.ask)))
    edf=pd.DataFrame(entries);edf.to_csv(OUT/"entries.csv",index=False);print("ENTRIES",len(edf),flush=True)
    specs=sorted({(r.symbol,pd.Timestamp(r.expiration),float(r.strike)) for _,r in edf.iterrows()})
    exits={}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs=[ex.submit(exit_one,s) for s in specs]
        for n,f in enumerate(as_completed(futs),1):
            try:s,x=f.result();exits[s]=x
            except Exception as e:print("EXIT_WARN",repr(e),flush=True)
            if n%25==0:print("EXIT_PROGRESS",n,len(specs),flush=True)
    alltr=[];reports=[]
    for variant in ["vrp","vrp_ivrank"]:
        base=[];stress=[]
        for _,r in edf[edf.variant.eq(variant)].iterrows():
            x=exits.get((r.symbol,pd.Timestamp(r.expiration),float(r.strike)))
            if x is None:continue
            debit=max(0,float(x["ask"]))
            for stressed in [False,True]:
                credit=max(0,float(r.bid)-(STRESS if stressed else 0))
                pnl=(credit-debit)*100-(COMM*(4 if stressed else 2))
                maxrisk=max(1,float(r.strike)*100-credit*100)
                tr=dict(variant=variant+("_stress" if stressed else ""),entry=str(pd.Timestamp(r.entry).date()),symbol=r.symbol,
                  expiration=str(pd.Timestamp(r.expiration).date()),strike=float(r.strike),delta=float(r.delta),dte=int(r.dte),
                  entry_bid=float(r.bid),exit_ask=debit,pnl=pnl,roc=pnl/maxrisk,vrp_ratio=float(r.vrp_ratio),
                  iv_rank=None if pd.isna(r.iv_rank) else float(r.iv_rank))
                alltr.append(tr);(stress if stressed else base).append(tr)
        m=summarize(variant,base);ms=summarize(variant+"_stress",stress)
        m.update(stress_trades=ms.get("trades",0),stress_profit_factor=ms.get("profit_factor"),
          stress_avg_pnl=ms.get("avg_pnl"),stress_net_pnl=ms.get("net_pnl"),stress_positive_years=ms.get("positive_years",0))
        m["passes_gate"]=bool(m.get("trades",0)>=70 and (m.get("profit_factor") or 0)>=1.25 and m.get("positive_years",0)>=2
          and (m.get("avg_pnl") or -1)>0 and (m.get("stress_profit_factor") or 0)>=1.10
          and (m.get("stress_avg_pnl") or -1)>0 and m.get("stress_positive_years",0)>=2)
        reports.append(m);print("REPORT",json.dumps(m),flush=True)
    pd.DataFrame(alltr).to_csv(OUT/"trades.csv",index=False)
    sm={"name":"MOTU v0.1 turbo core","validation":["2021-01-01","2022-12-31"],"holdout":"2023-2025 SEALED",
        "reports":reports,"eligible":[r["variant"] for r in reports if r.get("passes_gate")],"holdout_opened":False}
    (OUT/"summary.json").write_text(json.dumps(sm,indent=2))
    print("FINAL_MOTU_TURBO_BEGIN");print(json.dumps(sm,indent=2));print("FINAL_MOTU_TURBO_END")
if __name__=="__main__":main()
