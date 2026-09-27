from __future__ import annotations
import json,os
from pathlib import Path
import numpy as np,pandas as pd
ROOT=Path(os.environ.get("QIE_DATA_ROOT","/tmp/options-dataset"));OUT=Path(os.environ.get("QIE_OUT_DIR","dan_desk_v2_results"));OUT.mkdir(parents=True,exist_ok=True)
START=pd.Timestamp("2011-01-03");END=pd.Timestamp("2022-12-30");COMM=.65;MULT=100.;MIN_OI=100
DTES=[7,14,30,45];DELTAS=[.10,.15,.20,.25,.30]
def U(t):
 d=pd.read_parquet(ROOT/t.lower()/"underlying_prices.parquet");d.date=pd.to_datetime(d.date);return d.sort_values("date").drop_duplicates("date").set_index("date")
def O(t):
 cs=["expiration","strike","type","bid","ask","bid_size","ask_size","open_interest","date","delta"];a=[]
 for y in range(2011,2023):
  p=ROOT/t.lower()/f"options_{y}.parquet"
  if not p.exists():continue
  x=pd.read_parquet(p,columns=cs);x.date=pd.to_datetime(x.date);x.expiration=pd.to_datetime(x.expiration);x.type=x.type.astype(str).str.lower();x["dte"]=(x.expiration-x.date).dt.days
  for c in ["strike","bid","ask","bid_size","ask_size","open_interest","delta"]:x[c]=pd.to_numeric(x[c],errors="coerce")
  x=x.dropna(subset=["expiration","strike","bid","ask","delta"])
  x=x[(x.ask>=x.bid)&(x.bid>=0)&(x.ask>0)&(x.open_interest.fillna(0)>=MIN_OI)&(x.bid_size.fillna(0)>=1)&(x.ask_size.fillna(0)>=1)&x.type.isin(["put","call"])]
  a.append(x)
 return pd.concat(a,ignore_index=True).sort_values(["date","expiration","strike"])
def precompute(o):
 out={}
 for date,g in o[(o.date>=START)&(o.date<=END)].groupby("date",sort=True):
  for dte in DTES:
   h=g[g.dte.between(max(2,dte-4),dte+5)]
   if h.empty:continue
   for typ in ["put","call"]:
    z=h[h.type.eq(typ)]
    if typ=="put":z=z[z.delta.between(-.45,-.02)]
    else:z=z[z.delta.between(.02,.45)]
    if z.empty:continue
    for de in DELTAS:
     td=-de if typ=="put" else de
     s=(z.dte-dte).abs()/max(dte,1)+(z.delta-td).abs()*4
     r=z.loc[s.idxmin()]
     out[(date,dte,de,typ)]=(pd.Timestamp(r.expiration),float(r.strike),float(r.bid),float(r.delta))
 return out
def exp_spot(u,exp):
 idx=u.index[u.index<=exp]
 if len(idx)==0:return None,None
 d=idx[-1];return d,float(u.loc[d,"close"])
def next_date(dates,d):
 i=np.searchsorted(np.array(dates,dtype="datetime64[ns]"),np.datetime64(d))
 return dates[i] if i<len(dates) else None
def wheel(t,u,sel,dte,de):
 dates=sorted(set(k[0] for k in sel));entry=next_date(dates,START)
 if entry is None:return None
 S0=float(u.loc[entry,"close"]);cash=S0*MULT*1.05;initial=cash;shares=0;basis=0.;prem=0.;peak=initial;dds=[];n=0;assign=0;callaway=0
 while entry is not None and entry<=END:
  typ="put" if shares==0 else "call";r=sel.get((entry,dte,de,typ))
  if r is None:entry=next_date(dates,entry+pd.Timedelta(days=1));continue
  exp,k,bid,delta=r;pr=bid*MULT-COMM;cash+=pr;prem+=pr;n+=1;ed,sp=exp_spot(u,exp)
  if ed is None or ed>END:break
  if typ=="put" and sp<k:cash-=k*MULT;shares=100;basis=k;assign+=1
  elif typ=="call" and sp>k:cash+=k*MULT;shares=0;basis=0.;callaway+=1
  eq=cash+shares*sp;peak=max(peak,eq);dds.append(1-eq/peak);entry=next_date(dates,ed+pd.Timedelta(days=1))
 last=u.index[u.index<=END][-1];ending=cash+shares*float(u.loc[last,"close"]);yrs=(last-next_date(dates,START)).days/365.25
 return dict(strategy="wheel",ticker=t,dte=dte,delta=de,cagr=(ending/initial)**(1/yrs)-1,maxdd=max(dds or [0]),premium_yield=(prem/yrs)/initial,premium_per_100k=(prem/yrs)/initial*100000,trades=n,put_assignments=assign,calls_away=callaway)
def combo(t,u,sel,dte,de):
 dates=sorted(set(k[0] for k in sel));entry=next_date(dates,START)
 if entry is None:return None
 S0=float(u.loc[entry,"close"]);shares=100;cashcoll=S0*MULT;initial=2*S0*MULT;prem=0.;peak=initial;dds=[];n=0;putassign=0;callaway=0
 while entry is not None and entry<=END:
  p=sel.get((entry,dte,de,"put"));c=sel.get((entry,dte,de,"call"))
  if p is None or c is None or p[0]!=c[0]:entry=next_date(dates,entry+pd.Timedelta(days=1));continue
  exp,pk,pbid,_=p;_,ck,cbid,_=c;pr=(pbid+cbid)*MULT-2*COMM;cashcoll+=pr;prem+=pr;n+=1;ed,sp=exp_spot(u,exp)
  if ed is None or ed>END:break
  if sp<pk:cashcoll-=pk*MULT;shares+=100;putassign+=1
  if sp>ck:cashcoll+=ck*MULT;shares-=100;callaway+=1
  if shares>100:cashcoll+=(shares-100)*sp;shares=100
  elif shares<100:cashcoll-=(100-shares)*sp;shares=100
  eq=cashcoll+shares*sp;peak=max(peak,eq);dds.append(1-eq/peak);entry=next_date(dates,ed+pd.Timedelta(days=1))
 last=u.index[u.index<=END][-1];ending=cashcoll+100*float(u.loc[last,"close"]);yrs=(last-next_date(dates,START)).days/365.25
 return dict(strategy="covered_combo",ticker=t,dte=dte,delta=de,cagr=(ending/initial)**(1/yrs)-1,maxdd=max(dds or [0]),premium_yield=(prem/yrs)/initial,premium_per_100k=(prem/yrs)/initial*100000,trades=n,put_assignments=putassign,calls_away=callaway)
def main():
 rows=[]
 for t in ["SPY","QQQ","IWM"]:
  print("LOAD",t,flush=True);u=U(t);o=O(t);print("PRECOMPUTE",t,flush=True);sel=precompute(o);print("SELECTED",len(sel),flush=True)
  del o
  for dte in DTES:
   for de in DELTAS:
    for fn in [wheel,combo]:
     m=fn(t,u,sel,dte,de)
     if m:rows.append(m);print("M",json.dumps(m),flush=True)
 df=pd.DataFrame(rows);df.to_csv(OUT/"grid.csv",index=False)
 focus=df[(df.dte.isin([7,14]))&(df.delta<=.20)]
 # capital required to generate various annual cash-premium targets, based on each observed premium yield
 targets=[200000,300000,400000,500000,600000]
 cap=[]
 for _,r in df.iterrows():
  if r.premium_yield>0:
   for tar in targets:cap.append(dict(strategy=r.strategy,ticker=r.ticker,dte=int(r.dte),delta=float(r.delta),premium_yield=float(r.premium_yield),target=tar,capital_required=float(tar/r.premium_yield)))
 cdf=pd.DataFrame(cap);cdf.to_csv(OUT/"capital_backsolve.csv",index=False)
 summary={"period":[str(START.date()),str(END.date())],"rows":len(df),
 "weekend_like_top_cash_yield":focus.sort_values("premium_yield",ascending=False).head(15).to_dict("records"),
 "weekend_like_top_cagr":focus.sort_values("cagr",ascending=False).head(15).to_dict("records"),
 "all_top_cash_yield":df.sort_values("premium_yield",ascending=False).head(15).to_dict("records"),
 "all_top_cagr":df.sort_values("cagr",ascending=False).head(15).to_dict("records")}
 (OUT/"summary.json").write_text(json.dumps(summary,indent=2));print("FINAL_DAN_V2_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_DAN_V2_END")
if __name__=="__main__":main()
