from __future__ import annotations
import io, json, os, subprocess
from pathlib import Path
from typing import Optional
import numpy as np, pandas as pd

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v01_local_results"));OUT.mkdir(parents=True,exist_ok=True)
OPT=Path("/tmp/options");STK=Path("/tmp/stocks");ERN=Path("/tmp/earnings")
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
SYMS=",".join("'"+x+"'" for x in UNIVERSE)
VAL0=pd.Timestamp("2021-01-01");VAL1=pd.Timestamp("2022-12-31")
DTE_LO,DTE_HI,TARGET_DTE=7,21,14;TARGET_DELTA=-.20;COMM=.65;STRESS=.05

def dq(db:Path,sql:str)->pd.DataFrame:
    p=subprocess.run(["dolt","sql","-q",sql,"-r","csv"],cwd=db,text=True,capture_output=True,check=True)
    s=p.stdout.strip()
    return pd.DataFrame() if not s else pd.read_csv(io.StringIO(s))

def load_vol():
    q=f"""SELECT date,act_symbol,hv_current,hv_year_high,hv_year_low,iv_current,iv_year_high,iv_year_low
           FROM volatility_history WHERE date BETWEEN '2021-01-01' AND '2022-12-31'
           AND act_symbol IN ({SYMS}) ORDER BY date,act_symbol"""
    d=dq(OPT,q);d["date"]=pd.to_datetime(d.date)
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:d[c]=pd.to_numeric(d[c],errors="coerce")
    return d

def load_stocks():
    q=f"""SELECT date,act_symbol,open,high,low,close,volume FROM ohlcv
           WHERE date BETWEEN '2020-01-01' AND '2022-12-31'
           AND act_symbol IN ({SYMS}) ORDER BY act_symbol,date"""
    d=dq(STK,q);d["date"]=pd.to_datetime(d.date)
    for c in ["open","high","low","close","volume"]:d[c]=pd.to_numeric(d[c],errors="coerce")
    parts=[]
    for sym,g in d.groupby("act_symbol"):
        g=g.sort_values("date").copy();g["sma20"]=g.close.rolling(20).mean();g["sma200"]=g.close.rolling(200).mean()
        g["ret20"]=g.close/g.close.shift(20)-1;g["dd20"]=g.close/g.close.rolling(20).max()-1;parts.append(g)
    return pd.concat(parts,ignore_index=True)

def load_splits():
    try:
        d=dq(STK,f"""SELECT * FROM split
                     WHERE date BETWEEN '2021-01-01' AND '2022-12-31'
                     AND act_symbol IN ({SYMS}) ORDER BY act_symbol,date""")
    except Exception as e:
        print("SPLIT_WARN",repr(e),flush=True)
        return pd.DataFrame(columns=["act_symbol","date"])
    if d.empty:return d
    if "date" in d.columns:d["date"]=pd.to_datetime(d["date"])
    return d

def crosses_split(splits,sym,entry,expiration):
    if splits.empty or "act_symbol" not in splits.columns or "date" not in splits.columns:return False
    x=splits[(splits.act_symbol==sym)&(splits.date>entry)&(splits.date<=expiration)]
    return not x.empty

def load_earnings():
    if not ERN.exists():return pd.DataFrame(columns=["act_symbol","date"])
    try:
        d=dq(ERN,f"""SELECT act_symbol,date FROM earnings_calendar
                     WHERE date BETWEEN '2021-01-01' AND '2023-01-31'
                     AND act_symbol IN ({SYMS}) ORDER BY act_symbol,date""")
        if not d.empty:d["date"]=pd.to_datetime(d.date)
        return d
    except Exception as e:
        print("EARNINGS_WARN",repr(e),flush=True);return pd.DataFrame(columns=["act_symbol","date"])

def asof_stock(stocks,sym,date):
    x=stocks[(stocks.act_symbol==sym)&(stocks.date<=date)]
    if x.empty:return None
    r=x.iloc[-1]
    if (date-r.date).days>4:return None
    return r

def earnings_near(e,sym,date):
    x=e[e.act_symbol==sym]
    return False if x.empty else bool(((x.date>=date)&(x.date<=date+pd.Timedelta(days=21))).any())

def candidates(vol,stocks,earn):
    v=vol.dropna(subset=["hv_current","iv_current"]).copy();v=v[v.hv_current>0]
    v["week"]=v.date.dt.to_period("W-SUN")
    out=[]
    for wk,g in v.groupby("week"):
        chosen=None
        for dt in sorted(g.date.unique()):
            x=g[g.date.eq(dt)].copy()
            if len(x)>=8:chosen=x;break
        if chosen is None:continue
        rows=[]
        for _,r in chosen.iterrows():
            s=asof_stock(stocks,str(r.act_symbol),pd.Timestamp(r.date))
            if s is None:continue
            den=float(r.iv_year_high-r.iv_year_low) if pd.notna(r.iv_year_high) and pd.notna(r.iv_year_low) else np.nan
            ir=(float(r.iv_current-r.iv_year_low)/den) if np.isfinite(den) and den>1e-9 else np.nan
            rows.append(dict(date=pd.Timestamp(r.date),symbol=str(r.act_symbol),close=float(s.close),sma20=float(s.sma20) if pd.notna(s.sma20) else np.nan,
              sma200=float(s.sma200) if pd.notna(s.sma200) else np.nan,ret20=float(s.ret20) if pd.notna(s.ret20) else np.nan,dd20=float(s.dd20) if pd.notna(s.dd20) else np.nan,
              iv=float(r.iv_current),hv=float(r.hv_current),vrp_ratio=float(r.iv_current/r.hv_current),iv_rank=float(np.clip(ir,0,1)) if np.isfinite(ir) else np.nan,
              earnings_21d=earnings_near(earn,str(r.act_symbol),pd.Timestamp(r.date))))
        if not rows:continue
        w=pd.DataFrame(rows);w["vrp_pct"]=w.vrp_ratio.rank(pct=True);w["ivrank_pct"]=w.iv_rank.fillna(w.iv_rank.median()).rank(pct=True)
        w["composite"]=.65*w.vrp_pct+.35*w.ivrank_pct;w["above200"]=w.close>w.sma200;w["pullback"]=w.close<w.sma20;out.append(w)
    return pd.concat(out,ignore_index=True) if out else pd.DataFrame()

def select(cand):
    out=[]
    for dt,w in cand.groupby("date"):
        specs={"vrp":w,"vrp_ivrank":w,"trend_underwriter":w[w.above200],
               "earnings_aware":w[w.above200 & ~w.earnings_21d],
               "quality_pullback":w[w.above200 & w.pullback & ~w.earnings_21d]}
        for name,x in specs.items():
            if x.empty:continue
            r=(x.sort_values(["vrp_ratio","iv_rank"],ascending=False).iloc[0] if name=="vrp"
               else x.sort_values(["composite","vrp_ratio"],ascending=False).iloc[0])
            z=r.to_dict();z["variant"]=name;out.append(z)
    return pd.DataFrame(out)

def chain(date,syms):
    ss=",".join("'"+s+"'" for s in sorted(set(syms)));lo=(date+pd.Timedelta(days=DTE_LO)).date();hi=(date+pd.Timedelta(days=DTE_HI)).date()
    q=f"""SELECT date,act_symbol,expiration,strike,call_put,bid,ask,vol,delta
           FROM option_chain WHERE date='{date.date()}' AND act_symbol IN ({ss})
           AND expiration>='{lo}' AND expiration<='{hi}' ORDER BY act_symbol,expiration,strike,call_put"""
    d=dq(OPT,q)
    if d.empty:return d
    d["date"]=pd.to_datetime(d.date);d["expiration"]=pd.to_datetime(d.expiration)
    for c in ["strike","bid","ask","vol","delta"]:d[c]=pd.to_numeric(d[c],errors="coerce")
    d["dte"]=(d.expiration-d.date).dt.days;d["rel_spread"]=(d.ask-d.bid)/((d.ask+d.bid)/2).replace(0,np.nan)
    return d

def choose_put(ch,sym,spot):
    if ch is None or ch.empty or "act_symbol" not in ch.columns:return None
    p=ch[(ch.act_symbol==sym)&ch.call_put.astype(str).str.lower().str.startswith("p")].copy()
    p=p[p.delta.between(-.45,-.03)&p.dte.between(DTE_LO,DTE_HI)&(p.strike<spot)&(p.bid>=.05)&(p.ask>=p.bid)&(p.rel_spread<=.60)]
    if p.empty:return None
    p["score"]=(p.delta-TARGET_DELTA).abs()*5+(p.dte-TARGET_DTE).abs()/TARGET_DTE
    return p.sort_values(["score","rel_spread"]).iloc[0]

def expiry_close(stocks,sym,exp):
    x=stocks[(stocks.act_symbol==sym)&(stocks.date<=exp)]
    if x.empty:return None
    r=x.iloc[-1]
    if (exp-r.date).days>4:return None
    return float(r.close)

def summarize(name,arr):
    d=pd.DataFrame(arr)
    if d.empty:return {"variant":name,"trades":0}
    w=d[d.pnl>0];l=d[d.pnl<0];gp=float(w.pnl.sum());gl=float(-l.pnl.sum())
    d["year"]=pd.to_datetime(d.entry).dt.year;annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    return dict(variant=name,trades=int(len(d)),win_rate=float((d.pnl>0).mean()),assignment_rate=float(d.assigned.mean()),
      profit_factor=float(gp/gl) if gl>0 else None,avg_pnl=float(d.pnl.mean()),median_pnl=float(d.pnl.median()),
      avg_roc=float(d.roc.mean()),median_roc=float(d.roc.median()),worst_trade=float(d.pnl.min()),worst_roc=float(d.roc.min()),
      gross_premium=float(d.premium.sum()),net_pnl=float(d.pnl.sum()),positive_years=int(sum(v>0 for v in annual.values())),annual_pnl=annual)

def main():
    print("LOAD_LOCAL_TABLES",flush=True);vol=load_vol();stocks=load_stocks();earn=load_earnings();splits=load_splits()
    print("ROWS",len(vol),len(stocks),len(earn),len(splits),flush=True)
    if not splits.empty: print("SPLITS",splits.to_dict("records"),flush=True)
    cand=candidates(vol,stocks,earn);cand.to_csv(OUT/"candidate_panel.csv",index=False)
    sel=select(cand);sel.to_csv(OUT/"weekly_selections.csv",index=False);print("SELECTIONS",len(sel),flush=True)
    chains={}
    for n,(dt,g) in enumerate(sel.groupby("date"),1):
        chains[pd.Timestamp(dt)]=chain(pd.Timestamp(dt),g.symbol.tolist())
        if n%20==0:print("CHAIN_PROGRESS",n,sel.date.nunique(),flush=True)
    alltr=[];reports=[]
    for variant in sorted(sel.variant.unique()):
        base=[];stress=[]
        for _,r in sel[sel.variant==variant].sort_values("date").iterrows():
            p=choose_put(chains.get(pd.Timestamp(r.date)),str(r.symbol),float(r.close))
            if p is None:continue
            exp=pd.Timestamp(p.expiration)
            if crosses_split(splits,str(r.symbol),pd.Timestamp(r.date),exp):
                print("SKIP_SPLIT",str(r.symbol),str(pd.Timestamp(r.date).date()),str(exp.date()),flush=True)
                continue
            close=expiry_close(stocks,str(r.symbol),exp)
            if close is None:continue
            intrinsic=max(0,float(p.strike)-close)*100
            for stressed in [False,True]:
                credit=max(0,float(p.bid)-(STRESS if stressed else 0));premium=credit*100-COMM*(2 if stressed else 1)
                pnl=premium-intrinsic;coll=max(1,float(p.strike)*100-premium)
                tr=dict(variant=variant+("_stress" if stressed else ""),entry=str(pd.Timestamp(r.date).date()),symbol=str(r.symbol),
                    expiration=str(pd.Timestamp(p.expiration).date()),strike=float(p.strike),delta=float(p.delta),dte=int(p.dte),
                    entry_bid=float(p.bid),entry_ask=float(p.ask),rel_spread=float(p.rel_spread),spot_entry=float(r.close),spot_expiry=close,
                    premium=premium,intrinsic_loss=intrinsic,pnl=pnl,roc=pnl/coll,assigned=close<float(p.strike),
                    vrp_ratio=float(r.vrp_ratio),iv_rank=None if pd.isna(r.iv_rank) else float(r.iv_rank),
                    above200=bool(r.above200),earnings_21d=bool(r.earnings_21d))
                alltr.append(tr);(stress if stressed else base).append(tr)
        m=summarize(variant,base);ms=summarize(variant+"_stress",stress)
        m.update(stress_trades=ms.get("trades",0),stress_profit_factor=ms.get("profit_factor"),stress_avg_pnl=ms.get("avg_pnl"),
                 stress_net_pnl=ms.get("net_pnl"),stress_positive_years=ms.get("positive_years",0))
        m["passes_gate"]=bool(m.get("trades",0)>=70 and (m.get("profit_factor") or 0)>=1.25 and (m.get("avg_pnl") or -1)>0
          and m.get("positive_years",0)>=2 and (m.get("stress_profit_factor") or 0)>=1.10 and (m.get("stress_avg_pnl") or -1)>0
          and m.get("stress_positive_years",0)>=2)
        reports.append(m);print("REPORT",json.dumps(m),flush=True)
    pd.DataFrame(alltr).to_csv(OUT/"trades.csv",index=False);pd.DataFrame(reports).to_csv(OUT/"validation_summary.csv",index=False)
    sm={"name":"MOTU — Master of the Universe / Market Options Tactical Underwriter","validation":["2021-01-01","2022-12-31"],
        "holdout":"2023-2025 SEALED","universe":UNIVERSE,"reports":reports,
        "eligible_for_holdout":[r["variant"] for r in reports if r.get("passes_gate")],"holdout_opened":False}
    (OUT/"summary.json").write_text(json.dumps(sm,indent=2))
    print("FINAL_MOTU_LOCAL_BEGIN");print(json.dumps(sm,indent=2));print("FINAL_MOTU_LOCAL_END")
if __name__=="__main__":main()
