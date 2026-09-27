from __future__ import annotations
import json,os
from pathlib import Path
import numpy as np,pandas as pd
ROOT=Path(os.environ.get("QIE_DATA_ROOT","/tmp/options-dataset"));OUT=Path(os.environ.get("QIE_OUT_DIR","dan_focus_results"));OUT.mkdir(parents=True,exist_ok=True)
START=pd.Timestamp("2011-01-03");END=pd.Timestamp("2022-12-30");COMM=.65;M=100.;DTES=[7,14];DELTAS=[.10,.15,.20]
def lu(t):
 d=pd.read_parquet(ROOT/t.lower()/"underlying_prices.parquet");d.date=pd.to_datetime(d.date);return d.sort_values("date").drop_duplicates("date").set_index("date")
def lo(t):
 cs=["expiration","strike","type","bid","ask","bid_size","ask_size","open_interest","date","delta"];a=[]
 for y in range(2011,2023):
  p=ROOT/t.lower()/f"options_{y}.parquet"
  if not p.exists():continue
  x=pd.read_parquet(p,columns=cs);x.date=pd.to_datetime(x.date);x.expiration=pd.to_datetime(x.expiration);x.type=x.type.astype(str).str.lower();x["dte"]=(x.expiration-x.date).dt.days
  for c in ["strike","bid","ask","bid_size","ask_size","open_interest","delta"]:x[c]=pd.to_numeric(x[c],errors="coerce")
  x=x.dropna(subset=["expiration","strike","bid","ask","delta"]);x=x[(x.ask>=x.bid)&(x.bid>=0)&(x.ask>0)&(x.open_interest.fillna(0)>=50)&(x.bid_size.fillna(0)>=1)&(x.ask_size.fillna(0)>=1)&x.type.isin(["put","call"])&x.dte.between(3,19)]
  a.append(x)
 return pd.concat(a,ignore_index=True)
def select(o):
 out={}
 for d,g in o.groupby("date",sort=True):
  for dt in DTES:
   h=g[g.dte.between(max(3,dt-3),dt+4)]
   for typ in ["put","call"]:
    z=h[h.type.eq(typ)]
    if typ=="put":z=z[z.delta.between(-.35,-.03)]
    else:z=z[z.delta.between(.03,.35)]
    if z.empty:continue
    for de in DELTAS:
     td=-de if typ=="put" else de;s=(z.dte-dt).abs()/dt+(z.delta-td).abs()*5;r=z.loc[s.idxmin()]
     out[(d,dt,de,typ)]=(pd.Timestamp(r.expiration),float(r.strike),float(r.bid))
 return out
def nx(ds,d):
 a=np.array(ds,dtype="datetime64[ns]");i=np.searchsorted(a,np.datetime64(d));return ds[i] if i<len(ds) else None
def spot(u,e):
 a=u.index[u.index<=e]
 if not len(a):return None,None
 d=a[-1];return d,float(u.loc[d,"close"])
def wheel(t,u,s,dt,de):
 ds=sorted(set(k[0] for k in s));e=nx(ds,START);S=float(u.loc[e,"close"]);cash=1.05*S*M;ini=cash;sh=0;prem=0.;peak=ini;dd=[];n=0;ass=0;ca=0
 while e and e<=END:
  typ="put" if sh==0 else "call";r=s.get((e,dt,de,typ))
  if not r:e=nx(ds,e+pd.Timedelta(days=1));continue
  ex,k,b=r;pr=b*M-COMM;cash+=pr;prem+=pr;n+=1;ed,p=spot(u,ex)
  if ed is None or ed>END:break
  if typ=="put" and p<k:cash-=k*M;sh=100;ass+=1
  elif typ=="call" and p>k:cash+=k*M;sh=0;ca+=1
  eq=cash+sh*p;peak=max(peak,eq);dd.append(1-eq/peak);e=nx(ds,ed+pd.Timedelta(days=1))
 last=u.index[u.index<=END][-1];end=cash+sh*float(u.loc[last,"close"]);yrs=(last-nx(ds,START)).days/365.25
 return dict(strategy="wheel",ticker=t,dte=dt,delta=de,cagr=(end/ini)**(1/yrs)-1,maxdd=max(dd or [0]),premium_yield=(prem/yrs)/ini,premium_per_100k=(prem/yrs)/ini*1e5,trades=n,assignments=ass,calls_away=ca)
def combo(t,u,s,dt,de):
 ds=sorted(set(k[0] for k in s));e=nx(ds,START);S=float(u.loc[e,"close"]);sh=100;cc=S*M;ini=2*S*M;prem=0.;peak=ini;dd=[];n=0;ass=0;ca=0
 while e and e<=END:
  p=s.get((e,dt,de,"put"));c=s.get((e,dt,de,"call"))
  if not p or not c or p[0]!=c[0]:e=nx(ds,e+pd.Timedelta(days=1));continue
  ex,pk,pb=p;_,ck,cb=c;pr=(pb+cb)*M-2*COMM;cc+=pr;prem+=pr;n+=1;ed,x=spot(u,ex)
  if ed is None or ed>END:break
  if x<pk:cc-=pk*M;sh+=100;ass+=1
  if x>ck:cc+=ck*M;sh-=100;ca+=1
  if sh>100:cc+=(sh-100)*x;sh=100
  elif sh<100:cc-=(100-sh)*x;sh=100
  eq=cc+sh*x;peak=max(peak,eq);dd.append(1-eq/peak);e=nx(ds,ed+pd.Timedelta(days=1))
 last=u.index[u.index<=END][-1];end=cc+100*float(u.loc[last,"close"]);yrs=(last-nx(ds,START)).days/365.25
 return dict(strategy="covered_combo",ticker=t,dte=dt,delta=de,cagr=(end/ini)**(1/yrs)-1,maxdd=max(dd or [0]),premium_yield=(prem/yrs)/ini,premium_per_100k=(prem/yrs)/ini*1e5,trades=n,assignments=ass,calls_away=ca)
rows=[]
for t in ["SPY","QQQ","IWM"]:
 print("T",t,flush=True);u=lu(t);o=lo(t);s=select(o);print("SEL",len(s),flush=True)
 for dt in DTES:
  for de in DELTAS:
   for f in [wheel,combo]:
    r=f(t,u,s,dt,de);rows.append(r);print("R",json.dumps(r),flush=True)
df=pd.DataFrame(rows);df.to_csv(OUT/"grid.csv",index=False)
sm={"top_premium":df.sort_values("premium_yield",ascending=False).to_dict("records"),"top_cagr":df.sort_values("cagr",ascending=False).to_dict("records")}
(OUT/"summary.json").write_text(json.dumps(sm,indent=2));print("FINAL_DAN_FOCUS_BEGIN");print(json.dumps(sm,indent=2));print("FINAL_DAN_FOCUS_END")
