from __future__ import annotations
import json, os, time
from pathlib import Path
import numpy as np
import pandas as pd
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

API="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
EARNINGS_CSV=Path(os.environ.get("EARNINGS_CSV","/tmp/earnings/earnings_dates_all.csv"))
OUT=Path(os.environ.get("QIE_OUT_DIR","qie_v08_results")); OUT.mkdir(parents=True,exist_ok=True)

BASKET=["AAPL","MSFT","AMZN","NVDA","TSLA","NFLX","GOOGL","AMD","ADBE","CRM","ORCL","JPM"]
VAL_START=pd.Timestamp("2019-01-01"); VAL_END=pd.Timestamp("2021-12-31")
HOLD_START=pd.Timestamp("2022-01-01"); HOLD_END=pd.Timestamp("2022-12-31")
COMMISSION=.65
BASE_PENALTY=0.0
STRESS_PENALTY=.03
MIN_EVENT_SPACING=45
MAX_SNAPSHOT_GAP=5
TARGET_DAYS_AFTER_EVENT=21
MIN_DAYS_AFTER_EVENT=7
MAX_DAYS_AFTER_EVENT=35
MAX_REL_SPREAD=.35
WING_TARGET=.15

sess=requests.Session()
sess.headers.update({"User-Agent":"QIE-research/0.8"})

def sql(q,max_tries=4):
    last=None
    for k in range(max_tries):
        try:
            r=requests.get(API,params={"q":q},timeout=90,headers={"User-Agent":"QIE-research/0.8"})
            r.raise_for_status()
            j=r.json()
            if j.get("query_execution_status")!="Success":
                raise RuntimeError(j.get("query_execution_message") or "Dolt query failed")
            return pd.DataFrame(j.get("rows",[]))
        except Exception as e:
            last=e
            time.sleep(.35*(k+1))
    raise RuntimeError("query failed: %r\n%s"%(last,q[:400]))

def load_events():
    e=pd.read_csv(EARNINGS_CSV,low_memory=False)
    cmap={c.lower().strip():c for c in e.columns}
    if "ticker" not in cmap or "earnings_date" not in cmap:
        raise RuntimeError("Unexpected earnings schema: "+repr(list(e.columns)))
    z=e[[cmap["ticker"],cmap["earnings_date"]]].copy()
    z.columns=["ticker","event_date"]
    z["ticker"]=z.ticker.astype(str).str.upper().str.strip()
    z["event_date"]=pd.to_datetime(z.event_date,errors="coerce").dt.normalize()
    z=z[z.ticker.isin(BASKET)].dropna().drop_duplicates(["ticker","event_date"])
    z=z[(z.event_date>=VAL_START)&(z.event_date<=HOLD_END)].sort_values(["ticker","event_date"])
    keep=[]
    for t,g in z.groupby("ticker"):
        last=None
        for r in g.itertuples(index=False):
            d=pd.Timestamp(r.event_date)
            if last is None or (d-last).days>=MIN_EVENT_SPACING:
                keep.append((t,d)); last=d
    return pd.DataFrame(keep,columns=["ticker","event_date"]).sort_values(["event_date","ticker"]).reset_index(drop=True)

def norm_chain(d):
    if d.empty:return d
    for c in ["strike","bid","ask","vol","delta"]:
        d[c]=pd.to_numeric(d[c],errors="coerce")
    d["expiration"]=pd.to_datetime(d.expiration,errors="coerce").dt.normalize()
    d["date"]=pd.to_datetime(d.date,errors="coerce").dt.normalize()
    d["call_put"]=d.call_put.astype(str).str.lower()
    return d.dropna(subset=["expiration","strike","bid","ask","delta"])

def event_snapshot_dates(ticker,event):
    lo=(event-pd.Timedelta(days=8)).date().isoformat()
    hi=(event+pd.Timedelta(days=8)).date().isoformat()
    d=sql("SELECT DISTINCT date FROM option_chain WHERE act_symbol='%s' AND date BETWEEN '%s' AND '%s' ORDER BY date"%(ticker,lo,hi))
    if d.empty:return None
    ds=sorted(pd.to_datetime(d.date).dt.normalize().unique())
    pre=[pd.Timestamp(x) for x in ds if pd.Timestamp(x)<event]
    post=[pd.Timestamp(x) for x in ds if pd.Timestamp(x)>event]
    if not pre or not post:return None
    a,b=max(pre),min(post)
    if (event-a).days>MAX_SNAPSHOT_GAP or (b-event).days>MAX_SNAPSHOT_GAP:return None
    return a,b

def pre_chain(ticker,event,pre):
    elo=(event+pd.Timedelta(days=MIN_DAYS_AFTER_EVENT)).date().isoformat()
    ehi=(event+pd.Timedelta(days=MAX_DAYS_AFTER_EVENT)).date().isoformat()
    q="""SELECT date,expiration,strike,call_put,bid,ask,vol,delta FROM option_chain
         WHERE act_symbol='%s' AND date='%s' AND expiration BETWEEN '%s' AND '%s'
         AND delta BETWEEN -0.80 AND 0.80 ORDER BY expiration,strike,call_put"""%(
         ticker,pre.date().isoformat(),elo,ehi)
    return norm_chain(sql(q))

def choose_structure(d,event):
    if d.empty:return None
    exps=sorted(d.expiration.drop_duplicates().tolist(),
        key=lambda x:abs((pd.Timestamp(x)-(event+pd.Timedelta(days=TARGET_DAYS_AFTER_EVENT))).days))
    for exp in exps:
        x=d[d.expiration.eq(exp)].copy()
        c=x[(x.call_put=="call")&x.delta.between(.25,.75)].copy()
        p=x[(x.call_put=="put")&x.delta.between(-.75,-.25)].copy()
        if c.empty or p.empty:continue
        j=c.merge(p,on=["date","expiration","strike"],suffixes=("_c","_p"))
        if j.empty:continue
        j["score"]=(j.delta_c-.5).abs()+(j.delta_p+.5).abs()
        for r in j.sort_values("score").head(8).itertuples(index=False):
            if min(r.bid_c,r.bid_p)<=.10:continue
            if r.ask_c<r.bid_c or r.ask_p<r.bid_p:continue
            rs1=(r.ask_c-r.bid_c)/max((r.ask_c+r.bid_c)/2,.05)
            rs2=(r.ask_p-r.bid_p)/max((r.ask_p+r.bid_p)/2,.05)
            if max(rs1,rs2)>MAX_REL_SPREAD:continue
            atm=float(r.strike)
            calls=x[(x.call_put=="call")&(x.strike>atm)&x.delta.between(.05,.28)].copy()
            puts=x[(x.call_put=="put")&(x.strike<atm)&x.delta.between(-.28,-.05)].copy()
            cw=pw=None
            if not calls.empty:
                calls["ds"]=(calls.delta-WING_TARGET).abs(); cw=calls.sort_values("ds").iloc[0]
            if not puts.empty:
                puts["ds"]=(puts.delta+WING_TARGET).abs(); pw=puts.sort_values("ds").iloc[0]
            return {
              "expiration":pd.Timestamp(exp),"strike":atm,
              "call_pre":{"bid":float(r.bid_c),"ask":float(r.ask_c),"delta":float(r.delta_c)},
              "put_pre":{"bid":float(r.bid_p),"ask":float(r.ask_p),"delta":float(r.delta_p)},
              "call_wing":None if cw is None else {"strike":float(cw.strike),"bid":float(cw.bid),"ask":float(cw.ask),"delta":float(cw.delta)},
              "put_wing":None if pw is None else {"strike":float(pw.strike),"bid":float(pw.bid),"ask":float(pw.ask),"delta":float(pw.delta)}
            }
    return None

def post_quotes(ticker,post,sel):
    strikes=[sel["strike"]]
    if sel["call_wing"]:strikes.append(sel["call_wing"]["strike"])
    if sel["put_wing"]:strikes.append(sel["put_wing"]["strike"])
    istr=",".join(str(float(x)) for x in sorted(set(strikes)))
    q="""SELECT date,expiration,strike,call_put,bid,ask,vol,delta FROM option_chain
         WHERE act_symbol='%s' AND date='%s' AND expiration='%s' AND strike IN (%s)
         ORDER BY strike,call_put"""%(ticker,post.date().isoformat(),sel["expiration"].date().isoformat(),istr)
    d=norm_chain(sql(q))
    if d.empty:return None
    def pair(strike):
        z=d[np.isclose(d.strike,strike,atol=.001)]
        c=z[z.call_put=="call"]; p=z[z.call_put=="put"]
        return (None if c.empty else c.iloc[0],None if p.empty else p.iloc[0])
    c,p=pair(sel["strike"])
    if c is None or p is None:return None
    out={"call_post":{"bid":float(c.bid),"ask":float(c.ask)},"put_post":{"bid":float(p.bid),"ask":float(p.ask)}}
    if sel["call_wing"]:
        c2,_=pair(sel["call_wing"]["strike"])
        if c2 is not None:out["call_wing_post"]={"bid":float(c2.bid),"ask":float(c2.ask)}
    if sel["put_wing"]:
        _,p2=pair(sel["put_wing"]["strike"])
        if p2 is not None:out["put_wing_post"]={"bid":float(p2.bid),"ask":float(p2.ask)}
    return out

def structures(sel,post,penalty):
    cp,pp=sel["call_pre"],sel["put_pre"]; ca,pa=post["call_post"],post["put_post"]
    se=max(0,cp["bid"]-penalty)+max(0,pp["bid"]-penalty)
    sx=(ca["ask"]+penalty)+(pa["ask"]+penalty)
    spnl=(se-sx)*100-4*COMMISSION
    le=(cp["ask"]+penalty)+(pp["ask"]+penalty)
    lx=max(0,ca["bid"]-penalty)+max(0,pa["bid"]-penalty)
    lpnl=(lx-le)*100-4*COMMISSION
    out={
      "short_straddle":{"pnl":spnl,"capital":np.nan,"norm":spnl/max(se*100,1),"entry_premium":se},
      "long_straddle":{"pnl":lpnl,"capital":le*100,"norm":lpnl/max(le*100,1),"entry_premium":le}
    }
    if sel["call_wing"] and sel["put_wing"] and "call_wing_post" in post and "put_wing_post" in post:
        cw,pw=sel["call_wing"],sel["put_wing"]; cwp,pwp=post["call_wing_post"],post["put_wing_post"]
        credit=max(0,cp["bid"]-penalty)+max(0,pp["bid"]-penalty)-(cw["ask"]+penalty)-(pw["ask"]+penalty)
        debit=(ca["ask"]+penalty)+(pa["ask"]+penalty)-max(0,cwp["bid"]-penalty)-max(0,pwp["bid"]-penalty)
        width=max(cw["strike"]-sel["strike"],sel["strike"]-pw["strike"])
        maxrisk=width*100-credit*100
        if credit>0 and maxrisk>0:
            pnl=(credit-debit)*100-8*COMMISSION
            out["short_ironfly"]={"pnl":pnl,"capital":maxrisk,"norm":pnl/maxrisk,"entry_premium":credit}
    return out

def process_event(t,d):
    rows_base=[]; rows_stress=[]
    sd=event_snapshot_dates(t,d)
    if not sd:return rows_base,rows_stress
    pre,post=sd
    sel=choose_structure(pre_chain(t,d,pre),d)
    if not sel:return rows_base,rows_stress
    pq=post_quotes(t,post,sel)
    if not pq:return rows_base,rows_stress
    for penalty,target in [(BASE_PENALTY,rows_base),(STRESS_PENALTY,rows_stress)]:
        for strategy,v in structures(sel,pq,penalty).items():
            target.append({
              "ticker":t,"event_date":str(d.date()),"pre_date":str(pre.date()),"post_date":str(post.date()),
              "strategy":strategy,"pnl":float(v["pnl"]),
              "capital":None if not np.isfinite(v["capital"]) else float(v["capital"]),
              "norm":float(v["norm"]),"entry_premium":float(v["entry_premium"]),
              "strike":float(sel["strike"]),"expiration":str(sel["expiration"].date()),
              "event_to_expiry":int((sel["expiration"]-d).days)
            })
    return rows_base,rows_stress

def collect_both(events,start,end,label):
    rows_base=[]; rows_stress=[]
    ev=events[(events.event_date>=start)&(events.event_date<=end)].copy()
    jobs=[(r.ticker,pd.Timestamp(r.event_date)) for r in ev.itertuples(index=False)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs={pool.submit(process_event,t,d):(t,d) for t,d in jobs}
        done=0
        for fut in as_completed(futs):
            t,d=futs[fut]
            try:
                b,s=fut.result()
                rows_base.extend(b); rows_stress.extend(s)
            except Exception as e:
                print("EVENT_ERR",t,d.date(),repr(e),flush=True)
            done+=1
            if done%12==0:print("PROGRESS",label,done,"/",len(jobs),"base_rows",len(rows_base),flush=True)
    return pd.DataFrame(rows_base),pd.DataFrame(rows_stress)

def summarize(df,strategy):
    d=df[df.strategy.eq(strategy)].copy()
    if d.empty:return {"strategy":strategy,"events":0}
    w=d[d.pnl>0]; l=d[d.pnl<0]; gp=w.pnl.sum(); gl=-l.pnl.sum()
    d["year"]=pd.to_datetime(d.event_date).dt.year
    annual={str(int(y)):float(g.pnl.sum()) for y,g in d.groupby("year")}
    ticker={str(t):float(g.pnl.sum()) for t,g in d.groupby("ticker")}
    return {
      "strategy":strategy,"events":int(len(d)),"tickers":int(d.ticker.nunique()),
      "win_rate":float(len(w)/len(d)),"profit_factor":float(gp/gl) if gl>0 else None,
      "avg_pnl":float(d.pnl.mean()),"median_pnl":float(d.pnl.median()),"total_pnl":float(d.pnl.sum()),
      "worst_trade":float(d.pnl.min()),"avg_norm":float(d.norm.mean()),"median_norm":float(d.norm.median()),
      "positive_years":int(sum(v>0 for v in annual.values())),"annual_pnl":annual,
      "positive_tickers":int(sum(v>0 for v in ticker.values())),"ticker_pnl":ticker
    }

def passes(base,stress):
    return (
      base.get("events",0)>=60 and base.get("tickers",0)>=9 and
      (base.get("profit_factor") or 0)>=1.20 and (base.get("avg_pnl") or -1)>0 and
      base.get("positive_years",0)>=3 and base.get("positive_tickers",0)>=7 and
      (stress.get("profit_factor") or 0)>=1.05 and (stress.get("avg_pnl") or -1)>0 and
      stress.get("positive_years",0)>=2 and stress.get("positive_tickers",0)>=6
    )

def main():
    events=load_events()
    print("EARNINGS_COLUMNS_OK EVENTS",len(events),flush=True)
    print("VALIDATION_EVENT_COUNTS",events[events.event_date<=VAL_END].groupby("ticker").size().to_dict(),flush=True)

    base,stress=collect_both(events,VAL_START,VAL_END,"validation")
    base.to_csv(OUT/"validation_trades.csv",index=False); stress.to_csv(OUT/"validation_stress_trades.csv",index=False)

    reports=[]; eligible=[]
    for s in ["short_straddle","long_straddle","short_ironfly"]:
        b=summarize(base,s); st=summarize(stress,s)
        b.update({
          "stress_profit_factor":st.get("profit_factor"),"stress_avg_pnl":st.get("avg_pnl"),
          "stress_positive_years":st.get("positive_years"),"stress_positive_tickers":st.get("positive_tickers"),
          "stress_events":st.get("events")
        })
        b["passes_gate"]=passes(b,st)
        reports.append(b)
        if b["passes_gate"]:eligible.append(s)
        print("VALIDATION",json.dumps(b),flush=True)

    summary={
      "protocol":{
        "basket":BASKET,"validation":[str(VAL_START.date()),str(VAL_END.date())],
        "holdout":[str(HOLD_START.date()),str(HOLD_END.date())],
        "holdout_policy":"2022 option quotes are not queried unless a validation strategy passes",
        "snapshot_rule":"last option snapshot strictly before earnings date; first strictly after; <=5 calendar-day gap",
        "expiration_rule":"expiration 7-35 days after event, closest to +21 days",
        "base_execution":"cross displayed bid/ask plus commissions",
        "stress_execution":"base plus $0.03 adverse price per option contract on every transaction",
        "gate":">=60 events, >=9 tickers, PF>=1.20, all 3 validation years positive, >=7 positive tickers; stressed PF>=1.05, >=2 years and >=6 tickers positive"
      },
      "validation":reports,"eligible_for_holdout":eligible,"holdout_opened":False
    }

    if eligible:
        print("HOLDOUT_GATE_OPEN",eligible,flush=True)
        hb,hs=collect_both(events,HOLD_START,HOLD_END,"holdout")
        hb=hb[hb.strategy.isin(eligible)]; hs=hs[hs.strategy.isin(eligible)]
        hb.to_csv(OUT/"holdout_trades.csv",index=False); hs.to_csv(OUT/"holdout_stress_trades.csv",index=False)
        hrep=[]
        for s in eligible:
            b=summarize(hb,s); st=summarize(hs,s)
            b.update({"stress_profit_factor":st.get("profit_factor"),"stress_avg_pnl":st.get("avg_pnl"),
                      "stress_positive_tickers":st.get("positive_tickers"),"stress_events":st.get("events")})
            hrep.append(b); print("HOLDOUT",json.dumps(b),flush=True)
        summary["holdout_opened"]=True; summary["holdout"]=hrep
    else:
        print("HOLDOUT SEALED: no strategy passed validation",flush=True)

    pd.DataFrame(reports).to_csv(OUT/"validation_summary.csv",index=False)
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_V08_BEGIN"); print(json.dumps(summary,indent=2)); print("FINAL_V08_END")

if __name__=="__main__":
    main()
