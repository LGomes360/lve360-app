from __future__ import annotations
import json, os, math
from pathlib import Path
import numpy as np, pandas as pd

ROOT=Path(os.environ.get("QIE_DATA_ROOT","/tmp/options-dataset"))
OUT=Path(os.environ.get("QIE_OUT_DIR","dan_desk_v1_results"));OUT.mkdir(parents=True,exist_ok=True)
START=pd.Timestamp("2011-01-03");END=pd.Timestamp("2022-12-30")
COMM=.65;MULT=100.;MIN_OI=100
DTES=[7,14,30,45]
DELTAS=[.10,.15,.20,.25,.30]

def load_u(t):
 d=pd.read_parquet(ROOT/t.lower()/"underlying_prices.parquet");d.date=pd.to_datetime(d.date)
 return d.sort_values("date").drop_duplicates("date").set_index("date")
def load_o(t):
 cols=["contract_id","expiration","strike","type","bid","ask","bid_size","ask_size","open_interest","date","implied_volatility","delta"]
 a=[]
 for y in range(2011,2023):
  p=ROOT/t.lower()/f"options_{y}.parquet"
  if not p.exists():continue
  x=pd.read_parquet(p,columns=cols);x.date=pd.to_datetime(x.date);x.expiration=pd.to_datetime(x.expiration)
  x.type=x.type.astype(str).str.lower();x["dte"]=(x.expiration-x.date).dt.days
  for c in ["strike","bid","ask","bid_size","ask_size","open_interest","implied_volatility","delta"]:x[c]=pd.to_numeric(x[c],errors="coerce")
  x=x.dropna(subset=["contract_id","expiration","strike","bid","ask","delta"])
  x=x[(x.ask>=x.bid)&(x.bid>=0)&(x.ask>0)&(x.open_interest.fillna(0)>=MIN_OI)&(x.bid_size.fillna(0)>=1)&(x.ask_size.fillna(0)>=1)]
  a.append(x)
 return pd.concat(a,ignore_index=True).sort_values(["date","expiration","strike"])
def pick(day,typ,target_dte,target_abs_delta):
 x=day[(day.type==typ)&day.dte.between(max(2,target_dte-4),target_dte+5)].copy()
 if x.empty:return None
 td=(-target_abs_delta if typ=="put" else target_abs_delta)
 # restrict sensible delta
 if typ=="put":x=x[x.delta.between(-.45,-.02)]
 else:x=x[x.delta.between(.02,.45)]
 if x.empty:return None
 x["score"]=(x.dte-target_dte).abs()/max(target_dte,1)+(x.delta-td).abs()*4
 return x.sort_values("score").iloc[0]
def expiry_spot(u,exp):
 idx=u.index[u.index<=exp]
 if len(idx)==0:return None,None
 d=idx[-1];return d,float(u.loc[d,"close"])
def next_trading_date(u,d):
 idx=u.index[u.index>=d]
 return idx[0] if len(idx) else None

def wheel(t,u,o,target_dte,delta):
 days={d:g for d,g in o[(o.date>=START)&(o.date<=END)].groupby("date",sort=True)}
 dates=sorted(d for d in days if d in u.index)
 if not dates:return None,[]
 entry=dates[0];cash=float(u.loc[entry,"close"])*MULT*1.05;shares=0
 initial=cash;peak=initial;curve=[];events=[];premium=0.;stock_realized=0.
 basis=None
 while entry is not None and entry<=END:
  if entry not in days: entry=next((d for d in dates if d>=entry),None)
  if entry is None:break
  day=days[entry]
  if shares==0:
   r=pick(day,"put",target_dte,delta)
   if r is None: entry=next((d for d in dates if d>entry),None);continue
   prem=float(r.bid)*MULT-COMM;cash+=prem;premium+=prem
   ex=pd.Timestamp(r.expiration);ed,sp=expiry_spot(u,ex)
   if ed is None or ed>END:break
   assigned=sp<float(r.strike)
   if assigned:
    cost=float(r.strike)*MULT;cash-=cost;shares=100;basis=float(r.strike)
   events.append(dict(entry=str(entry.date()),exit=str(ed.date()),kind="put",strike=float(r.strike),premium=prem,assigned=assigned,spot=sp))
   entry=next_trading_date(u,ed+pd.Timedelta(days=1))
  else:
   r=pick(day,"call",target_dte,delta)
   if r is None: entry=next((d for d in dates if d>entry),None);continue
   prem=float(r.bid)*MULT-COMM;cash+=prem;premium+=prem
   ex=pd.Timestamp(r.expiration);ed,sp=expiry_spot(u,ex)
   if ed is None or ed>END:break
   called=sp>float(r.strike)
   if called:
    proceeds=float(r.strike)*MULT;cash+=proceeds
    stock_realized+=(float(r.strike)-basis)*MULT;shares=0;basis=None
   events.append(dict(entry=str(entry.date()),exit=str(ed.date()),kind="call",strike=float(r.strike),premium=prem,called=called,spot=sp))
   entry=next_trading_date(u,ed+pd.Timedelta(days=1))
  # rough equity mark at event date
  mark=0 if shares==0 else shares*sp
  eq=cash+mark;peak=max(peak,eq);curve.append((ed,eq,1-eq/peak))
 lastd=u.index[u.index<=END][-1];last=float(u.loc[lastd,"close"]);ending=cash+shares*last
 yrs=(lastd-dates[0]).days/365.25
 cagr=(ending/initial)**(1/yrs)-1
 maxdd=max([x[2] for x in curve],default=0)
 return dict(strategy="wheel",ticker=t,dte=target_dte,delta=delta,initial=initial,ending=ending,cagr=cagr,maxdd=maxdd,
             total_premium=premium,premium_per_year=premium/yrs,premium_yield_on_initial=(premium/yrs)/initial,
             stock_realized=stock_realized,ending_shares=shares,trades=len(events)),events

def combo(t,u,o,target_dte,delta):
 days={d:g for d,g in o[(o.date>=START)&(o.date<=END)].groupby("date",sort=True)}
 dates=sorted(d for d in days if d in u.index)
 if not dates:return None,[]
 entry=dates[0];S0=float(u.loc[entry,"close"])
 # start with one 100-share lot + enough cash to fully secure a put approximately at spot
 shares=100;cash=S0*MULT;cash-=S0*MULT
 # separate collateral account notionally equal to one stock notional
 cash_coll=S0*MULT
 initial=S0*MULT+cash_coll
 premium=0.;stock_pnl=0.;peak=initial;curve=[];events=[]
 while entry is not None and entry<=END:
  if entry not in days:entry=next((d for d in dates if d>=entry),None)
  if entry is None:break
  day=days[entry];p=pick(day,"put",target_dte,delta);c=pick(day,"call",target_dte,delta)
  if p is None or c is None:
   entry=next((d for d in dates if d>entry),None);continue
  # require similar expiration; if not, choose next day
  if pd.Timestamp(p.expiration)!=pd.Timestamp(c.expiration):
   entry=next((d for d in dates if d>entry),None);continue
  pp=float(p.bid)*MULT-COMM;cp=float(c.bid)*MULT-COMM;cash_coll+=pp+cp;premium+=pp+cp
  ex=pd.Timestamp(p.expiration);ed,sp=expiry_spot(u,ex)
  if ed is None or ed>END:break
  # settle both options, then rebalance to 100 shares at market for next cycle
  if sp<float(p.strike):
   # assigned 100 additional shares at put strike from collateral/cash
   cash_coll-=float(p.strike)*MULT;shares+=100
  if sp>float(c.strike):
   # one lot called away at call strike
   cash_coll+=float(c.strike)*MULT;shares-=100
  # normalize inventory back to exactly 100 shares at expiration spot
  if shares>100:
   extra=shares-100;cash_coll+=extra*sp;shares=100
  elif shares<100:
   need=100-shares;cash_coll-=need*sp;shares=100
  equity=cash_coll+shares*sp;peak=max(peak,equity);curve.append((ed,equity,1-equity/peak))
  events.append(dict(entry=str(entry.date()),exit=str(ed.date()),put_strike=float(p.strike),call_strike=float(c.strike),
                     premium=pp+cp,spot=sp))
  entry=next_trading_date(u,ed+pd.Timedelta(days=1))
 lastd=u.index[u.index<=END][-1];last=float(u.loc[lastd,"close"]);ending=cash_coll+shares*last
 yrs=(lastd-dates[0]).days/365.25;cagr=(ending/initial)**(1/yrs)-1
 maxdd=max([x[2] for x in curve],default=0)
 return dict(strategy="covered_combo",ticker=t,dte=target_dte,delta=delta,initial=initial,ending=ending,cagr=cagr,maxdd=maxdd,
             total_premium=premium,premium_per_year=premium/yrs,premium_yield_on_initial=(premium/yrs)/initial,trades=len(events)),events

def main():
 allm=[]
 for t in ["SPY","QQQ","IWM"]:
  print("LOAD",t,flush=True);u=load_u(t);o=load_o(t)
  for dte in DTES:
   for delta in DELTAS:
    for fn in [wheel,combo]:
     try:m,e=fn(t,u,o,dte,delta)
     except Exception as ex:
      print("ERR",t,dte,delta,fn.__name__,repr(ex),flush=True);continue
     if m:
      allm.append(m);print("METRIC",json.dumps(m),flush=True)
 pd.DataFrame(allm).to_csv(OUT/"grid.csv",index=False)
 # summarize cells closest to Dan clues: weekend cadence = 7/14d; low/moderate delta <=.20
 df=pd.DataFrame(allm)
 focus=df[(df.dte.isin([7,14]))&(df.delta<=.20)]
 summary={
  "period":[str(START.date()),str(END.date())],
  "grid_rows":len(df),
  "focus_top_premium_yield":focus.sort_values("premium_yield_on_initial",ascending=False).head(12).to_dict("records"),
  "focus_top_total_return":focus.sort_values("cagr",ascending=False).head(12).to_dict("records"),
  "all_top_premium_yield":df.sort_values("premium_yield_on_initial",ascending=False).head(12).to_dict("records"),
  "all_top_total_return":df.sort_values("cagr",ascending=False).head(12).to_dict("records")
 }
 (OUT/"summary.json").write_text(json.dumps(summary,indent=2))
 print("FINAL_DAN_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_DAN_END")
if __name__=="__main__":main()
