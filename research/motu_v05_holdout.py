from __future__ import annotations
import io,json,os,subprocess,math
from pathlib import Path
import numpy as np,pandas as pd

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v05_results"));OUT.mkdir(parents=True,exist_ok=True)
OPT=Path("/tmp/options");STK=Path("/tmp/stocks");ERN=Path("/tmp/earnings")
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
SYMS=",".join("'"+x+"'" for x in UNIVERSE)
VAL0=pd.Timestamp("2023-01-01");VAL1=pd.Timestamp("2025-12-31")
DTE_LO,DTE_HI,TARGET_DTE=7,21,14
PUT_DELTA=-.20;CALL_DELTA=.20
COMM=.65;STRESS_PENALTY=.05
INITIAL_NAV=2_000_000.0;SLOTS=5;SLOT_NAV=INITIAL_NAV/SLOTS

# Split-adjusted trading dates verified from issuer filings / IR.
SPLITS={
 "AAPL":[(pd.Timestamp("2020-08-31"),4.0)],
 "NVDA":[(pd.Timestamp("2021-07-20"),4.0)],
 "AMZN":[(pd.Timestamp("2022-06-06"),20.0)],
 "TSLA":[(pd.Timestamp("2020-08-31"),5.0),(pd.Timestamp("2022-08-25"),3.0)],
 "WMT":[(pd.Timestamp("2024-02-26"),3.0)],
 "NVDA":[(pd.Timestamp("2021-07-20"),4.0),(pd.Timestamp("2024-06-10"),10.0)],
}

def dq(db:Path,sql:str)->pd.DataFrame:
    p=subprocess.run(["dolt","sql","-q",sql,"-r","csv"],cwd=db,text=True,capture_output=True,check=True)
    s=p.stdout.strip()
    return pd.DataFrame() if not s else pd.read_csv(io.StringIO(s))

def load_vol():
    q=f"""SELECT date,act_symbol,hv_current,hv_year_high,hv_year_low,iv_current,iv_year_high,iv_year_low
           FROM volatility_history WHERE date BETWEEN '2023-01-01' AND '2025-12-31'
           AND act_symbol IN ({SYMS}) ORDER BY date,act_symbol"""
    d=dq(OPT,q);d["date"]=pd.to_datetime(d.date)
    for c in ["hv_current","hv_year_high","hv_year_low","iv_current","iv_year_high","iv_year_low"]:d[c]=pd.to_numeric(d[c],errors="coerce")
    return d

def load_stocks():
    q=f"""SELECT date,act_symbol,open,high,low,close,volume FROM ohlcv
           WHERE date BETWEEN '2022-01-01' AND '2025-12-31'
           AND act_symbol IN ({SYMS},'SPY','QQQ','HYG','LQD') ORDER BY act_symbol,date"""
    d=dq(STK,q);d["date"]=pd.to_datetime(d.date)
    for c in ["open","high","low","close","volume"]:d[c]=pd.to_numeric(d[c],errors="coerce")
    parts=[]
    for sym,g in d.groupby("act_symbol"):
        g=g.sort_values("date").copy()
        g["sma20"]=g.close.rolling(20).mean()
        g["sma200"]=g.close.rolling(200).mean()
        g["ret20"]=g.close/g.close.shift(20)-1
        parts.append(g)
    return pd.concat(parts,ignore_index=True)

def load_earnings():
    q=f"""SELECT act_symbol,date FROM earnings_calendar
           WHERE date BETWEEN '2023-01-01' AND '2026-02-15'
           AND act_symbol IN ({SYMS}) ORDER BY act_symbol,date"""
    d=dq(ERN,q)
    if d.empty:return d
    d["date"]=pd.to_datetime(d.date)
    return d

def stock_row(stocks,sym,date):
    x=stocks[(stocks.act_symbol==sym)&(stocks.date<=date)]
    if x.empty:return None
    r=x.iloc[-1]
    if (date-r.date).days>4:return None
    return r

def earnings_near(earnings,sym,date,days=45):
    x=earnings[earnings.act_symbol==sym]
    if x.empty:return False
    return bool(((x.date>=date)&(x.date<=date+pd.Timedelta(days=days))).any())

def market_above_200(stocks,date):
    r=stock_row(stocks,"SPY",date)
    return False if r is None or pd.isna(r.sma200) else bool(r.close>r.sma200)

def build_credit(stocks):
    h=stocks[stocks.act_symbol=="HYG"][["date","close"]].rename(columns={"close":"hyg"})
    l=stocks[stocks.act_symbol=="LQD"][["date","close"]].rename(columns={"close":"lqd"})
    x=h.merge(l,on="date",how="inner").sort_values("date")
    x["ratio"]=x.hyg/x.lqd
    x["ratio_sma50"]=x.ratio.rolling(50).mean()
    x["ratio_ret20"]=x.ratio/x.ratio.shift(20)-1
    return x

def credit_healthy(credit,date):
    x=credit[credit.date<=date]
    if x.empty:return False
    r=x.iloc[-1]
    if (date-r.date).days>4 or pd.isna(r.ratio_sma50):return False
    return bool(r.ratio>=r.ratio_sma50)

def build_panel(vol):
    v=vol.dropna(subset=["hv_current","iv_current"]).copy();v=v[v.hv_current>0]
    v["week"]=v.date.dt.to_period("W-SUN");out=[]
    for wk,g in v.groupby("week"):
        chosen=None
        for dt in sorted(g.date.unique()):
            x=g[g.date.eq(dt)].copy()
            if len(x)>=8:chosen=x;break
        if chosen is None:continue
        den=chosen.iv_year_high-chosen.iv_year_low
        chosen["iv_rank"]=((chosen.iv_current-chosen.iv_year_low)/den).where(den>1e-9).clip(0,1)
        chosen["vrp_ratio"]=chosen.iv_current/chosen.hv_current
        chosen["vrp_pct"]=chosen.vrp_ratio.rank(pct=True)
        chosen["ivrank_pct"]=chosen.iv_rank.fillna(chosen.iv_rank.median()).rank(pct=True)
        chosen["composite"]=.65*chosen.vrp_pct+.35*chosen.ivrank_pct
        out.append(chosen)
    return pd.concat(out,ignore_index=True) if out else pd.DataFrame()

def spot(stocks,sym,date):
    x=stocks[(stocks.act_symbol==sym)&(stocks.date<=date)]
    if x.empty:return None
    r=x.iloc[-1]
    if (date-r.date).days>4:return None
    return float(r.close)

def weekly_chain(date):
    lo=date.date();hi=(date+pd.Timedelta(days=DTE_HI)).date()
    q=f"""SELECT date,act_symbol,expiration,strike,call_put,bid,ask,vol,delta
           FROM option_chain WHERE date='{date.date()}' AND act_symbol IN ({SYMS})
           AND expiration>='{lo}' AND expiration<='{hi}'
           ORDER BY act_symbol,expiration,strike,call_put"""
    d=dq(OPT,q)
    if d.empty:return d
    d["date"]=pd.to_datetime(d.date);d["expiration"]=pd.to_datetime(d.expiration)
    for c in ["strike","bid","ask","vol","delta"]:d[c]=pd.to_numeric(d[c],errors="coerce")
    d["dte"]=(d.expiration-d.date).dt.days
    d["rel_spread"]=(d.ask-d.bid)/((d.ask+d.bid)/2).replace(0,np.nan)
    return d

def split_between(sym,start,end):
    for d,f in SPLITS.get(sym,[]):
        if start<d<=end:return d,f
    return None

def crosses_split(sym,entry,expiration):
    for d,f in SPLITS.get(sym,[]):
        if entry<d<=expiration:return True
    return False

def choose_put(ch,sym,sp,date):
    if ch.empty:return None
    p=ch[(ch.act_symbol==sym)&ch.call_put.astype(str).str.lower().str.startswith("p")].copy()
    p=p[p.delta.between(-.45,-.03)&p.dte.between(DTE_LO,DTE_HI)&(p.strike<sp)&(p.bid>=.05)&(p.ask>=p.bid)&(p.rel_spread<=.60)]
    if p.empty:return None
    p=p[~p.expiration.apply(lambda e:crosses_split(sym,date,pd.Timestamp(e)))]
    if p.empty:return None
    p["score"]=(p.delta-PUT_DELTA).abs()*5+(p.dte-TARGET_DTE).abs()/TARGET_DTE
    return p.sort_values(["score","rel_spread"]).iloc[0]

def choose_call(ch,sym,sp,date,basis_floor=None):
    if ch.empty:return None
    c=ch[(ch.act_symbol==sym)&ch.call_put.astype(str).str.lower().str.startswith("c")].copy()
    c=c[c.delta.between(.03,.45)&c.dte.between(DTE_LO,DTE_HI)&(c.strike>sp)&(c.bid>=.05)&(c.ask>=c.bid)&(c.rel_spread<=.60)]
    if basis_floor is not None:c=c[c.strike>=basis_floor]
    if c.empty:return None
    c=c[~c.expiration.apply(lambda e:crosses_split(sym,date,pd.Timestamp(e)))]
    if c.empty:return None
    c["score"]=(c.delta-CALL_DELTA).abs()*5+(c.dte-TARGET_DTE).abs()/TARGET_DTE
    return c.sort_values(["score","rel_spread"]).iloc[0]

def new_slot():
    return dict(cash=SLOT_NAV,symbol=None,shares=0,basis=0.0,open=None,premium=0.0,assignments=0,calls_away=0)

def new_port(selector,call_rule,gate,stress):
    return dict(name=f"{selector}__{call_rule}__{gate}"+("__stress" if stress else ""),
                selector=selector,call_rule=call_rule,gate=gate,stress=stress,
                slots=[new_slot() for _ in range(SLOTS)],curve=[],events=[],premium=0.0)

def net_premium(bid,contracts,stress):
    credit=max(0.0,float(bid)-(STRESS_PENALTY if stress else 0.0))
    fee=COMM*(2 if stress else 1)*contracts
    return credit*100*contracts-fee

def apply_splits(port,prev,date):
    for s in port["slots"]:
        if not s["symbol"] or s["shares"]<=0:continue
        hit=split_between(s["symbol"],prev,date)
        if hit:
            d,f=hit
            s["shares"]=int(round(s["shares"]*f))
            s["basis"]/=f
            port["events"].append(dict(date=str(d.date()),event="split",symbol=s["symbol"],factor=f))

def settle_expired(port,date,stocks):
    for s in port["slots"]:
        o=s["open"]
        if not o or o["expiration"]>date:continue
        sp=spot(stocks,s["symbol"],o["expiration"])
        if sp is None:continue
        if o["type"]=="put":
            if sp<o["strike"]:
                cost=o["strike"]*100*o["contracts"]
                s["cash"]-=cost;s["shares"]=100*o["contracts"]
                # Economic basis nets the put premium received.
                s["basis"]=o["strike"]-(o["premium"]/(100*o["contracts"]))
                s["assignments"]+=1
                port["events"].append(dict(date=str(o["expiration"].date()),event="put_assigned",symbol=s["symbol"],strike=o["strike"],spot=sp,contracts=o["contracts"]))
            else:
                port["events"].append(dict(date=str(o["expiration"].date()),event="put_expired",symbol=s["symbol"],strike=o["strike"],spot=sp,contracts=o["contracts"]))
                s["symbol"]=None
        else:
            if sp>o["strike"]:
                s["cash"]+=o["strike"]*s["shares"]
                port["events"].append(dict(date=str(o["expiration"].date()),event="call_away",symbol=s["symbol"],strike=o["strike"],spot=sp,shares=s["shares"]))
                s["shares"]=0;s["basis"]=0.0;s["symbol"]=None;s["calls_away"]+=1
            else:
                port["events"].append(dict(date=str(o["expiration"].date()),event="call_expired",symbol=s["symbol"],strike=o["strike"],spot=sp,shares=s["shares"]))
        s["open"]=None

def open_calls(port,date,ch,stocks):
    for s in port["slots"]:
        if s["shares"]<=0 or s["open"] is not None or not s["symbol"]:continue
        sp=spot(stocks,s["symbol"],date)
        if sp is None:continue
        floor=s["basis"] if port["call_rule"]=="basis_call" else None
        c=choose_call(ch,s["symbol"],sp,date,floor)
        if c is None:continue
        n=s["shares"]//100
        prem=net_premium(c.bid,n,port["stress"])
        if prem<=0:continue
        s["cash"]+=prem;s["premium"]+=prem;port["premium"]+=prem
        # Every collected call premium lowers economic break-even.
        s["basis"]-=prem/max(1,s["shares"])
        s["open"]=dict(type="call",expiration=pd.Timestamp(c.expiration),strike=float(c.strike),contracts=n,premium=prem,entry=str(date.date()))
        port["events"].append(dict(date=str(date.date()),event="sell_call",symbol=s["symbol"],strike=float(c.strike),delta=float(c.delta),contracts=n,premium=prem,basis=s["basis"]))

def ranked(panel_date,selector):
    if selector=="vrp":return panel_date.sort_values(["vrp_ratio","iv_rank"],ascending=False)
    return panel_date.sort_values(["composite","vrp_ratio"],ascending=False)

def gate_capacity(port,date,stocks,credit):
    healthy_credit=credit_healthy(credit,date)
    healthy_market=market_above_200(stocks,date)
    if port["gate"]=="credit_gate":
        return 5 if healthy_credit else 0
    if port["gate"]=="transmission_adaptive":
        if not healthy_credit:return 0
        return 5 if healthy_market else 2
    if port["gate"]=="dual_hard":
        return 5 if (healthy_credit and healthy_market) else 0
    return 5

def candidate_allowed(port,sym,date,stocks,earnings):
    if earnings_near(earnings,sym,date,45):
        return False
    r=stock_row(stocks,sym,date)
    if r is None or pd.isna(r.sma200) or not (r.close>r.sma200):
        return False
    return True

def fill_puts(port,date,panel_date,ch,stocks,earnings,credit):
    active={s["symbol"] for s in port["slots"] if s["symbol"]}
    capacity=gate_capacity(port,date,stocks,credit)
    if len(active)>=capacity:
        return
    ranks=ranked(panel_date,port["selector"])
    for s in port["slots"]:
        if len(active)>=capacity:break
        if s["symbol"] or s["open"] or s["shares"]>0:continue
        chosen=None
        for _,r in ranks.iterrows():
            sym=str(r.act_symbol)
            if sym in active:continue
            if not candidate_allowed(port,sym,date,stocks,earnings):continue
            sp=spot(stocks,sym,date)
            if sp is None:continue
            p=choose_put(ch,sym,sp,date)
            if p is None:continue
            maxn=int(s["cash"]//(float(p.strike)*100))
            if maxn<1:continue
            chosen=(sym,p,maxn);break
        if chosen is None:continue
        sym,p,n=chosen
        prem=net_premium(p.bid,n,port["stress"])
        if prem<=0:continue
        s["symbol"]=sym;s["cash"]+=prem;s["premium"]+=prem;port["premium"]+=prem
        s["open"]=dict(type="put",expiration=pd.Timestamp(p.expiration),strike=float(p.strike),contracts=n,premium=prem,entry=str(date.date()))
        active.add(sym)
        port["events"].append(dict(date=str(date.date()),event="sell_put",symbol=sym,strike=float(p.strike),delta=float(p.delta),contracts=n,premium=prem,
                                   gate=port["gate"],market_above_200=market_above_200(stocks,date),credit_healthy=credit_healthy(credit,date)))

def option_mark(ch,s,o,date,sp):
    if o is None:return 0.0
    typ="p" if o["type"]=="put" else "c"
    x=ch[(ch.act_symbol==s["symbol"])&
         ch.call_put.astype(str).str.lower().str.startswith(typ)&
         (ch.expiration==o["expiration"])&
         (np.isclose(ch.strike,o["strike"],atol=.011))]
    if not x.empty:
        ask=pd.to_numeric(x.ask,errors="coerce").dropna()
        if not ask.empty:return float(ask.iloc[0])*100*o["contracts"]
    if o["type"]=="put":return max(0,o["strike"]-sp)*100*o["contracts"]
    return max(0,sp-o["strike"])*100*o["contracts"]

def equity(port,date,ch,stocks):
    total=0.0
    for s in port["slots"]:
        val=s["cash"]
        if s["symbol"] and s["shares"]>0:
            sp=spot(stocks,s["symbol"],date)
            if sp is not None:val+=s["shares"]*sp
        if s["symbol"] and s["open"] is not None:
            sp=spot(stocks,s["symbol"],date)
            if sp is not None:val-=option_mark(ch,s,s["open"],date,sp)
        total+=val
    return total

def benchmark(stocks,sym):
    x=stocks[(stocks.act_symbol==sym)&(stocks.date>=VAL0)&(stocks.date<=VAL1)].sort_values("date")
    if x.empty:return {}
    a=x.iloc[0];b=x.iloc[-1]
    years=(b.date-a.date).days/365.25
    return dict(start=str(a.date.date()),end=str(b.date.date()),total_return=float(b.close/a.close-1),cagr=float((b.close/a.close)**(1/years)-1))

def summarize(port):
    c=pd.DataFrame(port["curve"],columns=["date","equity"]).drop_duplicates("date").sort_values("date")
    c["peak"]=c.equity.cummax();c["dd"]=c.equity/c.peak-1
    start=INITIAL_NAV;end=float(c.iloc[-1].equity)
    years=(pd.Timestamp(c.iloc[-1].date)-pd.Timestamp(c.iloc[0].date)).days/365.25
    yr={}
    prev=start
    for y in [2023,2024,2025]:
        x=c[pd.to_datetime(c.date).dt.year==y]
        if not x.empty:
            last=float(x.iloc[-1].equity);yr[str(y)]=last/prev-1;prev=last
    assignments=sum(s["assignments"] for s in port["slots"]);calls=sum(s["calls_away"] for s in port["slots"])
    openstocks=[s["symbol"] for s in port["slots"] if s["symbol"]]
    return dict(name=port["name"],initial_nav=start,ending_nav=end,total_return=end/start-1,cagr=(end/start)**(1/years)-1,
                max_weekly_drawdown=float(c.dd.min()),annual_returns=yr,premium_collected=float(port["premium"]),
                premium_per_year=float(port["premium"]/years),premium_yield_on_initial=float((port["premium"]/years)/start),
                assignments=int(assignments),calls_away=int(calls),open_symbols=openstocks,events=len(port["events"]))

def main():
    vol=load_vol();stocks=load_stocks();earnings=load_earnings();credit=build_credit(stocks);panel=build_panel(vol)
    panel.to_csv(OUT/"weekly_panel.csv",index=False)
    dates=sorted(pd.to_datetime(panel.date.unique()))
    # Add exact year-end trading days for marked annual returns; no new trades on mark-only dates.
    mark_dates=[]
    for y in [2023,2024,2025]:
        x=stocks[(stocks.act_symbol=="SPY")&(stocks.date<=pd.Timestamp(y,12,31))]
        if not x.empty:mark_dates.append(pd.Timestamp(x.iloc[-1].date))
    event_dates=sorted(set(dates+mark_dates))

    ports=[]
    # Frozen v0.4-promoted candidates only. No other family may see the holdout.
    candidates=[
      ("vrp","delta_call","stocktrend_event45"),
      ("vrp","basis_call","stocktrend_event45"),
      ("vrp_ivrank","delta_call","stocktrend_event45"),
    ]
    for selector,call_rule,gate in candidates:
        for stress in [False,True]:
            ports.append(new_port(selector,call_rule,gate,stress))

    prev=pd.Timestamp("2022-12-31")
    for i,date in enumerate(event_dates,1):
        ch=weekly_chain(date)
        is_trade_date=date in dates
        daypanel=panel[panel.date.eq(date)] if is_trade_date else None
        for p in ports:
            apply_splits(p,prev,date)
            settle_expired(p,date,stocks)
            if is_trade_date:
                open_calls(p,date,ch,stocks)
                fill_puts(p,date,daypanel,ch,stocks,earnings,credit)
            eq=equity(p,date,ch,stocks)
            p["curve"].append((str(date.date()),eq))
        prev=date
        if i%20==0:print("PROGRESS",i,len(event_dates),flush=True)

    reports=[summarize(p) for p in ports]
    # Frozen holdout acceptance rule declared before this run.
    base={r["name"]:r for r in reports if not r["name"].endswith("__stress")}
    for name,r in base.items():
        sr=next((x for x in reports if x["name"]==name+"__stress"),None)
        r["stress_cagr"]=None if sr is None else sr["cagr"]
        r["stress_max_weekly_drawdown"]=None if sr is None else sr["max_weekly_drawdown"]
        r["stress_annual_returns"]=None if sr is None else sr["annual_returns"]
        yrs=r["annual_returns"];syrs={} if sr is None else sr["annual_returns"]
        r["passes_holdout"]=bool(
            r["cagr"]>=.06 and r["max_weekly_drawdown"]>=-.20 and
            len(yrs)==3 and sum(v>0 for v in yrs.values())>=2 and
            sr is not None and sr["cagr"]>=.04 and sr["max_weekly_drawdown"]>=-.22 and
            len(syrs)==3 and sum(v>0 for v in syrs.values())>=2
        )

    # Write detailed events/curves.
    ev=[];cv=[]
    for p in ports:
        for e in p["events"]:
            z=dict(e);z["portfolio"]=p["name"];ev.append(z)
        for d,e in p["curve"]:cv.append(dict(portfolio=p["name"],date=d,equity=e))
    pd.DataFrame(ev).to_csv(OUT/"events.csv",index=False)
    pd.DataFrame(cv).to_csv(OUT/"equity_curves.csv",index=False)
    pd.DataFrame(reports).to_csv(OUT/"portfolio_summary.csv",index=False)

    summary={
      "name":"MOTU v0.5 Sealed Holdout",
      "validation":["2023-01-01","2025-12-31"],
      "holdout_status":"OPENED ONCE for v0.4-promoted candidates only",
      "research_nav":INITIAL_NAV,"slots":SLOTS,
      "mechanics":{"put_delta":PUT_DELTA,"call_delta":CALL_DELTA,"dte":[DTE_LO,DTE_HI],"target_dte":TARGET_DTE,
                   "put_assignment":"take shares","call_cycle":"sell covered calls after assignment","pyramiding":"one symbol per slot/book",
                   "event_blackout_days":45,"stock_filter":"underlying above 200-day SMA",
                   "stress":"$0.05 less credit + doubled commissions"},
      "candidates":[
        "vrp__delta_call__stocktrend_event45",
        "vrp__basis_call__stocktrend_event45",
        "vrp_ivrank__delta_call__stocktrend_event45"
      ],
      "acceptance_rule":{"cagr_min":.06,"max_drawdown_floor":-.20,"positive_years_min":2,
                         "stress_cagr_min":.04,"stress_max_drawdown_floor":-.22,"stress_positive_years_min":2},
      "benchmarks":{"SPY":benchmark(stocks,"SPY"),"QQQ":benchmark(stocks,"QQQ")},
      "reports":reports,
      "passed_holdout":[r["name"] for r in base.values() if r.get("passes_holdout")],
      "holdout_opened":True
    }
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_MOTU_V05_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_MOTU_V05_END")

if __name__=="__main__":main()
