from __future__ import annotations
import io,json,os,subprocess,math
from pathlib import Path
import numpy as np,pandas as pd

OUT=Path(os.environ.get("MOTU_OUT_DIR","motu_v02_results"));OUT.mkdir(parents=True,exist_ok=True)
OPT=Path("/tmp/options");STK=Path("/tmp/stocks");ERN=Path("/tmp/earnings")
UNIVERSE=["AAPL","AMD","AMZN","BA","COST","CVX","DIS","JPM","MSFT","NFLX","NVDA","ORCL","PYPL","TSLA","WMT","XOM"]
SYMS=",".join("'"+x+"'" for x in UNIVERSE)
VAL0=pd.Timestamp("2021-01-01");VAL1=pd.Timestamp("2022-12-31")
DTE_LO,DTE_HI,TARGET_DTE=7,21,14
PUT_DELTA=-.20;CALL_DELTA=.20
COMM=.65;STRESS_PENALTY=.05
INITIAL_NAV=2_000_000.0;SLOTS=5;SLOT_NAV=INITIAL_NAV/SLOTS

# Split-adjusted trading dates verified from issuer filings / IR.
SPLITS={
 "NVDA":[(pd.Timestamp("2021-07-20"),4.0)],
 "AMZN":[(pd.Timestamp("2022-06-06"),20.0)],
 "TSLA":[(pd.Timestamp("2022-08-25"),3.0)],
}

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
           AND act_symbol IN ({SYMS},'SPY','QQQ') ORDER BY act_symbol,date"""
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
           WHERE date BETWEEN '2021-01-01' AND '2023-02-15'
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

def gate_capacity(port,date,stocks):
    if port["gate"]=="adaptive_trouble":
        return 5 if market_above_200(stocks,date) else 2
    if port["gate"]=="hard_market_gate":
        return 5 if market_above_200(stocks,date) else 0
    return 5

def candidate_allowed(port,sym,date,stocks,earnings):
    if earnings_near(earnings,sym,date,45):
        return False
    if port["gate"] in ("stocktrend_event45","adaptive_trouble","hard_market_gate"):
        r=stock_row(stocks,sym,date)
        if r is None or pd.isna(r.sma200) or not (r.close>r.sma200):
            return False
    return True

def fill_puts(port,date,panel_date,ch,stocks,earnings):
    active={s["symbol"] for s in port["slots"] if s["symbol"]}
    capacity=gate_capacity(port,date,stocks)
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
        port["events"].append(dict(date=str(date.date()),event="sell_put",symbol=sym,strike=float(p.strike),delta=float(p.delta),contracts=n,premium=prem,gate=port["gate"],market_above_200=market_above_200(stocks,date)))

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
    for y in [2021,2022]:
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
    vol=load_vol();stocks=load_stocks();earnings=load_earnings();panel=build_panel(vol)
    panel.to_csv(OUT/"weekly_panel.csv",index=False)
    dates=sorted(pd.to_datetime(panel.date.unique()))
    # Add exact year-end trading days for marked annual returns; no new trades on mark-only dates.
    mark_dates=[]
    for y in [2021,2022]:
        x=stocks[(stocks.act_symbol=="SPY")&(stocks.date<=pd.Timestamp(y,12,31))]
        if not x.empty:mark_dates.append(pd.Timestamp(x.iloc[-1].date))
    event_dates=sorted(set(dates+mark_dates))

    ports=[]
    gates=["event45","stocktrend_event45","adaptive_trouble","hard_market_gate"]
    for selector in ["vrp","vrp_ivrank"]:
        for call_rule in ["delta_call","basis_call"]:
            for gate in gates:
                for stress in [False,True]:
                    ports.append(new_port(selector,call_rule,gate,stress))

    prev=pd.Timestamp("2020-12-31")
    for i,date in enumerate(event_dates,1):
        ch=weekly_chain(date)
        is_trade_date=date in dates
        daypanel=panel[panel.date.eq(date)] if is_trade_date else None
        for p in ports:
            apply_splits(p,prev,date)
            settle_expired(p,date,stocks)
            if is_trade_date:
                open_calls(p,date,ch,stocks)
                fill_puts(p,date,daypanel,ch,stocks,earnings)
            eq=equity(p,date,ch,stocks)
            p["curve"].append((str(date.date()),eq))
        prev=date
        if i%20==0:print("PROGRESS",i,len(event_dates),flush=True)

    reports=[summarize(p) for p in ports]
    # Candidate gate is for v0.3 research only. Holdout remains sealed regardless.
    base={r["name"]:r for r in reports if not r["name"].endswith("__stress")}
    for name,r in base.items():
        sr=next((x for x in reports if x["name"]==name+"__stress"),None)
        r["stress_cagr"]=None if sr is None else sr["cagr"]
        r["stress_max_weekly_drawdown"]=None if sr is None else sr["max_weekly_drawdown"]
        r["stress_annual_returns"]=None if sr is None else sr["annual_returns"]
        r["candidate_for_v04"]=bool(
            r["cagr"]>=.10 and r["max_weekly_drawdown"]>=-.35 and
            all(v>0 for v in r["annual_returns"].values()) and len(r["annual_returns"])==2 and
            sr is not None and sr["cagr"]>=.08 and sr["max_weekly_drawdown"]>=-.40 and
            all(v>0 for v in sr["annual_returns"].values()) and len(sr["annual_returns"])==2
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
      "name":"MOTU v0.3 Trouble Gate diagnostic",
      "validation":["2021-01-01","2022-12-31"],
      "holdout":"2023-2025 SEALED",
      "research_nav":INITIAL_NAV,"slots":SLOTS,
      "mechanics":{"put_delta":PUT_DELTA,"call_delta":CALL_DELTA,"dte":[DTE_LO,DTE_HI],"target_dte":TARGET_DTE,
                   "put_assignment":"take shares","call_cycle":"sell covered calls after assignment","pyramiding":"one symbol per slot/book",
                   "call_rules":["delta_call","basis_call"],
                   "gates":["event45","stocktrend_event45","adaptive_trouble","hard_market_gate"],
                   "event_blackout_days":45,
                   "adaptive_trouble":"max 2 active underwriting slots when SPY <= SMA200; 5 otherwise",
                   "hard_market_gate":"no new puts when SPY <= SMA200",
                   "existing_inventory":"never force-liquidated; covered calls continue",
                   "stress":"$0.05 less credit + doubled commissions"},
      "benchmarks":{"SPY":benchmark(stocks,"SPY"),"QQQ":benchmark(stocks,"QQQ")},
      "reports":reports,
      "candidate_for_v03":[r["name"] for r in base.values() if r.get("candidate_for_v03")],
      "holdout_opened":False
    }
    (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_MOTU_V02_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_MOTU_V02_END")

if __name__=="__main__":main()
