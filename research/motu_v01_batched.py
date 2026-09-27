from __future__ import annotations
import json, os, time, calendar
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np, pandas as pd, requests

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v01_batched_results")); OUT.mkdir(parents=True,exist_ok=True)
OPT="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
STK="https://www.dolthub.com/api/v1alpha1/post-no-preference/stocks/master"
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
VAL0=pd.Timestamp("2021-01-01"); VAL1=pd.Timestamp("2022-12-31")
DTE_LO,DTE_HI,TARGET_DTE=7,21,14
TARGET_DELTA=-.20; COMM=.65; STRESS=.05
HEAD={"User-Agent":"MOTU-research/0.1-batched"}

def query(api,sql,timeout=35,tries=4):
    last=None
    for i in range(tries):
        try:
            r=requests.get(api,params={"q":sql},headers=HEAD,timeout=timeout);r.raise_for_status();j=r.json()
            if j.get("query_execution_status")!="Success":raise RuntimeError(j.get("query_execution_message","query failed"))
            return pd.DataFrame(j.get("rows",[]))
        except Exception as e:
            last=e;time.sleep(.6*(i+1))
    raise RuntimeError(f"{last} :: {sql[:300]}")

SYMS=",".join("'"+s+"'" for s in UNIVERSE)

def month_bounds(y,m):
    a=pd.Timestamp(y,m,1);b=pd.Timestamp(y,m,calendar.monthrange(y,m)[1]);return a,b

def fetch_vol_month(y,m):
    a,b=month_bounds(y,m)
    sql=f"""SELECT date,act_symbol,hv_current,hv_year_high,hv_year_low,iv_current,iv_year_high,iv_year_low
            FROM volatility_history
            WHERE date>='{a.date()}' AND date<='{b.date()}' AND act_symbol IN ({SYMS})
            ORDER BY date,act_symbol"""
    z=query(OPT,sql)
    if z.empty:return z
    z["date"]=pd.to_datetime(z.date)
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:z[c]=pd.to_numeric(z[c],errors="coerce")
    return z

def build_weekly_panel():
    months=[(y,m) for y in [2021,2022] for m in range(1,13)]
    frames=[]
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs={ex.submit(fetch_vol_month,y,m):(y,m) for y,m in months}
        for n,f in enumerate(as_completed(futs),1):
            ym=futs[f]
            try:z=f.result();frames.append(z);print("VOL_MONTH",ym,len(z),flush=True)
            except Exception as e:print("VOL_MONTH_WARN",ym,repr(e),flush=True)
    if not frames:raise RuntimeError("No volatility data")
    d=pd.concat(frames,ignore_index=True).drop_duplicates(["date","act_symbol"])
    d=d[(d.date>=VAL0)&(d.date<=VAL1)].copy()
    # choose first available cross-sectional snapshot each week
    d["week"]=d.date.dt.to_period("W-SUN")
    rows=[]
    for wk,g in d.groupby("week"):
        dates=sorted(g.date.unique())
        chosen=None
        for dt in dates:
            x=g[g.date.eq(dt)].copy()
            x=x.dropna(subset=["hv_current","iv_current"])
            x=x[x.hv_current>0]
            if len(x)>=8:
                chosen=x;break
        if chosen is None:continue
        den=chosen.iv_year_high-chosen.iv_year_low
        chosen["iv_rank"]=((chosen.iv_current-chosen.iv_year_low)/den).where(den>1e-9).clip(0,1)
        chosen["vrp_ratio"]=chosen.iv_current/chosen.hv_current
        chosen["vrp_pct"]=chosen.vrp_ratio.rank(pct=True)
        chosen["ivrank_pct"]=chosen.iv_rank.fillna(chosen.iv_rank.median()).rank(pct=True)
        chosen["composite"]=.65*chosen.vrp_pct+.35*chosen.ivrank_pct
        chosen["week"]=str(wk)
        rows.append(chosen)
    return pd.concat(rows,ignore_index=True) if rows else pd.DataFrame()

def selections(panel):
    out=[]
    for dt,g in panel.groupby("date"):
        r=g.sort_values(["vrp_ratio","iv_rank"],ascending=False).iloc[0]
        out.append({"date":pd.Timestamp(dt),"symbol":r.act_symbol,"variant":"vrp","vrp_ratio":float(r.vrp_ratio),"iv_rank":None if pd.isna(r.iv_rank) else float(r.iv_rank)})
        r=g.sort_values(["composite","vrp_ratio"],ascending=False).iloc[0]
        out.append({"date":pd.Timestamp(dt),"symbol":r.act_symbol,"variant":"vrp_ivrank","vrp_ratio":float(r.vrp_ratio),"iv_rank":None if pd.isna(r.iv_rank) else float(r.iv_rank)})
    return out

def fetch_chain(sym,date):
    lo=(date+pd.Timedelta(days=DTE_LO)).date();hi=(date+pd.Timedelta(days=DTE_HI)).date()
    sql=f"""SELECT date,expiration,strike,call_put,bid,ask,vol,delta
            FROM option_chain WHERE date='{date.date()}' AND act_symbol='{sym}'
            AND expiration>='{lo}' AND expiration<='{hi}'
            ORDER BY expiration,strike,call_put LIMIT 5000"""
    z=query(OPT,sql,timeout=25,tries=3)
    if z.empty:return z
    z["date"]=pd.to_datetime(z.date);z["expiration"]=pd.to_datetime(z.expiration)
    for c in ["strike","bid","ask","vol","delta"]:z[c]=pd.to_numeric(z[c],errors="coerce")
    z["dte"]=(z.expiration-z.date).dt.days
    z["rel_spread"]=(z.ask-z.bid)/((z.ask+z.bid)/2).replace(0,np.nan)
    return z

def choose_put(ch):
    if ch.empty:return None
    puts=ch[ch.call_put.astype(str).str.lower().str.startswith("p")].copy()
    puts=puts[puts.delta.between(-.45,-.03)&puts.dte.between(DTE_LO,DTE_HI)&(puts.bid>=.05)&(puts.ask>=puts.bid)&(puts.rel_spread<=.60)]
    if puts.empty:return None
    puts["score"]=(puts.delta-TARGET_DELTA).abs()*5+(puts.dte-TARGET_DTE).abs()/TARGET_DTE
    return puts.sort_values(["score","rel_spread"]).iloc[0]

def fetch_stock_close(sym,date):
    # exact day first, then previous 4 calendar days for weekend/holiday expiry
    a=(date-pd.Timedelta(days=4)).date();b=date.date()
    sql=f"""SELECT date,close FROM ohlcv
            WHERE act_symbol='{sym}' AND date>='{a}' AND date<='{b}'
            ORDER BY date DESC LIMIT 1"""
    z=query(STK,sql,timeout=20,tries=3)
    if z.empty:return None,None
    z["date"]=pd.to_datetime(z.date);z["close"]=pd.to_numeric(z.close,errors="coerce");z=z.dropna(subset=["close"])
    if z.empty:return None,None
    r=z.iloc[0];return pd.Timestamp(r.date),float(r.close)

def prepare_trade(sel):
    ch=fetch_chain(sel["symbol"],sel["date"]);p=choose_put(ch)
    if p is None:return None
    ed,spot=fetch_stock_close(sel["symbol"],pd.Timestamp(p.expiration))
    if ed is None:return None
    return dict(**sel,expiration=pd.Timestamp(p.expiration),strike=float(p.strike),delta=float(p.delta),dte=int(p.dte),
                bid=float(p.bid),ask=float(p.ask),rel_spread=float(p.rel_spread),expiry_session=ed,expiry_spot=spot)

def score_trade(t,stress=False):
    credit=max(0,t["bid"]-(STRESS if stress else 0))
    premium=credit*100-COMM
    intrinsic=max(0,t["strike"]-t["expiry_spot"])*100
    pnl=premium-intrinsic-COMM # one entry + one expiry/assignment-equivalent fee allowance
    coll=max(1,t["strike"]*100-premium)
    return dict(variant=t["variant"]+("_stress" if stress else ""),entry=str(t["date"].date()),symbol=t["symbol"],
                expiration=str(t["expiration"].date()),expiry_session=str(t["expiry_session"].date()),strike=t["strike"],delta=t["delta"],dte=t["dte"],
                bid=t["bid"],ask=t["ask"],rel_spread=t["rel_spread"],expiry_spot=t["expiry_spot"],
                vrp_ratio=t["vrp_ratio"],iv_rank=t["iv_rank"],premium=premium,intrinsic_loss=intrinsic,pnl=pnl,roc=pnl/coll,assigned=t["expiry_spot"]<t["strike"],collateral=coll)

def summarize(name,arr):
    d=pd.DataFrame(arr)
    if d.empty:return {"variant":name,"trades":0}
    w=d[d.pnl>0];l=d[d.pnl<0];gp=float(w.pnl.sum());gl=float(-l.pnl.sum())
    d["year"]=pd.to_datetime(d.entry).dt.year;annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return {"variant":name,"trades":int(len(d)),"win_rate":float((d.pnl>0).mean()),"assignment_rate":float(d.assigned.mean()),
            "profit_factor":float(gp/gl) if gl>0 else None,"avg_pnl":float(d.pnl.mean()),"median_pnl":float(d.pnl.median()),
            "avg_roc":float(d.roc.mean()),"worst_trade":float(d.pnl.min()),"worst_roc":float(d.roc.min()),"net_pnl":float(d.pnl.sum()),
            "positive_years":int(sum(v>0 for v in annual.values())),"annual_pnl":annual}

def main():
    panel=build_weekly_panel();panel.to_csv(OUT/"weekly_panel.csv",index=False)
    sels=selections(panel);pd.DataFrame(sels).to_csv(OUT/"selections.csv",index=False)
    # dedupe identical date-symbol selections across selectors
    keys={}
    for s in sels:keys[(str(s["date"].date()),s["symbol"])]=s
    prepared={}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs={ex.submit(prepare_trade,s):k for k,s in keys.items()}
        for n,f in enumerate(as_completed(futs),1):
            k=futs[f]
            try:prepared[k]=f.result()
            except Exception as e:print("TRADE_PREP_WARN",k,repr(e),flush=True);prepared[k]=None
            if n%20==0:print("TRADE_PREP_PROGRESS",n,len(futs),flush=True)
    alltr=[];reports=[]
    for variant in ["vrp","vrp_ivrank"]:
        base=[];stress=[]
        for s in [x for x in sels if x["variant"]==variant]:
            t=prepared.get((str(s["date"].date()),s["symbol"]))
            if not t:continue
            # use selector-specific metadata if same date/symbol chosen by both
            t=dict(t);t["variant"]=variant;t["vrp_ratio"]=s["vrp_ratio"];t["iv_rank"]=s["iv_rank"]
            a=score_trade(t,False);b=score_trade(t,True);base.append(a);stress.append(b);alltr.extend([a,b])
        m=summarize(variant,base);ms=summarize(variant+"_stress",stress)
        m.update(stress_trades=ms.get("trades",0),stress_profit_factor=ms.get("profit_factor"),stress_avg_pnl=ms.get("avg_pnl"),
                 stress_net_pnl=ms.get("net_pnl"),stress_positive_years=ms.get("positive_years",0))
        m["passes_gate"]=bool(m.get("trades",0)>=70 and (m.get("profit_factor") or 0)>=1.25 and (m.get("avg_pnl") or -1)>0
              and m.get("positive_years",0)>=2 and (m.get("stress_profit_factor") or 0)>=1.10 and (m.get("stress_avg_pnl") or -1)>0
              and m.get("stress_positive_years",0)>=2)
        reports.append(m);print("REPORT",json.dumps(m),flush=True)
    pd.DataFrame(alltr).to_csv(OUT/"trades.csv",index=False)
    summary={"name":"MOTU v0.1 batched cross-sectional validation","validation":["2021-01-01","2022-12-31"],"holdout":"2023-2025 SEALED",
             "universe":UNIVERSE,"selectors":["vrp","vrp_ivrank"],"reports":reports,
             "eligible":[r["variant"] for r in reports if r.get("passes_gate")],"holdout_opened":False}
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_MOTU_BATCHED_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_MOTU_BATCHED_END")
if __name__=="__main__":main()
