from __future__ import annotations
import json, os
from pathlib import Path
import numpy as np, pandas as pd

DATA_ROOT=Path(os.environ.get("QIE_DATA_ROOT","/tmp/options-dataset"))
OUT=Path(os.environ.get("QIE_OUT_DIR","qie_v07_results")); OUT.mkdir(parents=True,exist_ok=True)
CAL0,CAL1=pd.Timestamp("2011-01-03"),pd.Timestamp("2017-12-29")
VAL0,VAL1=pd.Timestamp("2018-01-02"),pd.Timestamp("2022-12-30")
MULT=100.; COMM=.65; HOLD=10; MIN_OI=100

def under(t):
 d=pd.read_parquet(DATA_ROOT/t.lower()/"underlying_prices.parquet"); d.date=pd.to_datetime(d.date)
 d=d.sort_values("date").drop_duplicates("date").set_index("date"); px=d.close.astype(float)
 r=np.log(px/px.shift(1)); d["rv20"]=r.rolling(20).std()*np.sqrt(252); d["sma200"]=px.rolling(200).mean()
 return d
def options(t):
 cs=["contract_id","expiration","strike","type","bid","ask","bid_size","ask_size","open_interest","date","implied_volatility","delta","vega"]
 a=[]
 for y in range(2011,2023):
  p=DATA_ROOT/t.lower()/f"options_{y}.parquet"
  if not p.exists():continue
  x=pd.read_parquet(p,columns=cs); x.date=pd.to_datetime(x.date); x.expiration=pd.to_datetime(x.expiration)
  x.type=x.type.astype(str).str.lower(); x["dte"]=(x.expiration-x.date).dt.days
  for c in ["strike","bid","ask","bid_size","ask_size","open_interest","implied_volatility","delta","vega"]:x[c]=pd.to_numeric(x[c],errors="coerce")
  x=x.dropna(subset=["contract_id","strike","bid","ask","implied_volatility","delta","vega"])
  x=x[x.dte.between(14,60)&x.type.isin(["call","put"])&(x.ask>=x.bid)&(x.bid>=0)&(x.ask>0)&(x.open_interest.fillna(0)>=MIN_OI)&(x.bid_size.fillna(0)>=1)&(x.ask_size.fillna(0)>=1)]
  a.append(x)
 return pd.concat(a,ignore_index=True).sort_values(["date","expiration","strike"])
def atm(day):
 e=day[day.dte.between(35,50)][["expiration","dte"]].drop_duplicates()
 if e.empty:return None
 e=e.assign(z=(e.dte-42).abs()); ex=e.sort_values(["z","dte"]).iloc[0].expiration; x=day[day.expiration.eq(ex)]
 c=x[(x.type=="call")&x.delta.between(.35,.65)].copy(); p=x[(x.type=="put")&x.delta.between(-.65,-.35)].copy()
 if c.empty or p.empty:return None
 j=c.merge(p,on=["date","expiration","strike","dte"],suffixes=("_c","_p")); 
 if j.empty:return None
 j["z"]=(j.delta_c-.5).abs()+(j.delta_p+.5).abs(); r=j.sort_values("z").iloc[0]
 return dict(exp=pd.Timestamp(r.expiration),call=str(r.contract_id_c),put=str(r.contract_id_p),iv=float((r.implied_volatility_c+r.implied_volatility_p)/2),vega=float(r.vega_c+r.vega_p))
def feats(o):
 return {d:a for d,g in o.groupby("date",sort=True) if (a:=atm(g)) is not None}
def qi(o):return o[(o.date>=VAL0)&(o.date<=VAL1)].set_index(["date","contract_id"]).sort_index()
def q(idx,d,c):
 try:
  r=idx.loc[(d,c)]; return r.iloc[0] if isinstance(r,pd.DataFrame) else r
 except KeyError:return None
def trade(entry, direction, fs,fq, us,uq, dates, stress=False):
 # direction +1 = long QQQ vol / short SPY vol; -1 reverse
 qa,qs=2,2
 # vega match by adjusting QQQ qty modestly
 qa=max(1,min(5,int(round(qs*fs["vega"]/max(fq["vega"],1e-9)))))
 legs=[("QQQ",fq["call"],direction,qa,fq["exp"]),("QQQ",fq["put"],direction,qa,fq["exp"]),
       ("SPY",fs["call"],-direction,qs,fs["exp"]),("SPY",fs["put"],-direction,qs,fs["exp"])]
 pen=.02 if stress else 0.; hb=2. if stress else 1.
 cash=0.; hedge={}; prev={}; hp=0.; hc=0.
 for t,c,s,n,e in legs:
  r=q(uq if t=="QQQ" else us,entry,c)
  if r is None:return None
  px=float(r.ask if s>0 else r.bid); cash+=(-px if s>0 else px)*MULT*n-COMM*n-pen*MULT*n
  hedge[t]=hedge.get(t,0)-s*n*float(r.delta)*MULT
 for t in hedge:
  sp=float((QQQ_U if t=="QQQ" else SPY_U).loc[entry,"close"]);prev[t]=sp;hc+=abs(hedge[t])*sp*hb/10000
 pos=dates.index(entry); last=entry
 for d in dates[pos+1:min(len(dates),pos+HOLD+5)]:
  if d>VAL1:break
  ok=True
  for t in hedge:
   U=QQQ_U if t=="QQQ" else SPY_U
   if d not in U.index:ok=False;break
   sp=float(U.loc[d,"close"]);hp+=hedge[t]*(sp-prev[t]);prev[t]=sp
  if not ok:continue
  last=d
  nd={}
  allq=True
  for t,c,s,n,e in legs:
   r=q(uq if t=="QQQ" else us,d,c)
   if r is None:allq=False;break
   nd[t]=nd.get(t,0)-s*n*float(r.delta)*MULT
  if allq:
   for t in hedge:
    ch=nd[t]-hedge[t];hc+=abs(ch)*prev[t]*hb/10000;hedge[t]=nd[t]
  if (d-entry).days>=14:break
 ex=0.
 for t,c,s,n,e in legs:
  r=q(uq if t=="QQQ" else us,last,c)
  if r is None:return None
  px=float(r.bid if s>0 else r.ask);ex+=(px if s>0 else -px)*MULT*n-COMM*n-pen*MULT*n
 for t,h in hedge.items():hc+=abs(h)*prev[t]*hb/10000
 return cash+ex+hp-hc
def summ(name,arr):
 d=pd.DataFrame(arr)
 if d.empty:return dict(strategy=name,trades=0)
 w=d[d.pnl>0].pnl.sum();l=-d[d.pnl<0].pnl.sum(); yrs=d.groupby(d.entry.str[:4]).pnl.sum().to_dict()
 return dict(strategy=name,trades=len(d),win_rate=float((d.pnl>0).mean()),profit_factor=float(w/l) if l else None,avg_pnl=float(d.pnl.mean()),total_pnl=float(d.pnl.sum()),positive_years=sum(v>0 for v in yrs.values()),annual=yrs)

SPY_U=under("SPY");QQQ_U=under("QQQ");SPY_O=options("SPY");QQQ_O=options("QQQ");SPY_F=feats(SPY_O);QQQ_F=feats(QQQ_O);SI=qi(SPY_O);QI=qi(QQQ_O)
common=sorted(set(SPY_F)&set(QQQ_F)); cal=[d for d in common if CAL0<=d<=CAL1]; ratios={d:QQQ_F[d]["iv"]/SPY_F[d]["iv"] for d in common}
a=np.array([ratios[d] for d in cal]); lo,hi=np.quantile(a,[.15,.85])
dates=sorted(d for d in set(SPY_U.index)&set(QQQ_U.index) if VAL0<=d<=VAL1)
configs=[]
# frozen diagnostic: mean reversion vs momentum, optionally gated by SPY above/below SMA200 or high/low RV20 median calibrated
calrv=SPY_U.loc[CAL0:CAL1,"rv20"].dropna(); rvmed=float(calrv.median())
for mode in ["mean_reversion","momentum"]:
 for regime in ["all","bull","bear","lowvol","highvol"]:
  for stress in [False,True]:
   arr=[];blocked=None
   for d in dates:
    if d not in ratios or not(d in SPY_F and d in QQQ_F):continue
    r=ratios[d]
    if not(r<=lo or r>=hi):continue
    row=SPY_U.loc[d]
    gate={"all":True,"bull":row.close>row.sma200,"bear":row.close<=row.sma200,"lowvol":row.rv20<=rvmed,"highvol":row.rv20>rvmed}[regime]
    if not gate or (blocked is not None and d<=blocked):continue
    rich=1 if r>=hi else -1
    # MR: short rich QQQ relative vol; momentum: long rich QQQ relative vol
    direction=(-rich if mode=="mean_reversion" else rich)
    p=trade(d,direction,SPY_F[d],QQQ_F[d],SI,QI,dates,stress)
    if p is None:continue
    arr.append(dict(entry=str(d.date()),pnl=float(p),ratio=float(r),direction=direction))
    blocked=d+pd.Timedelta(days=14)
   m=summ(f"{mode}_{regime}_{'stress' if stress else 'base'}",arr);configs.append(m);print("RESULT",json.dumps(m),flush=True)
df=pd.DataFrame(configs);df.to_csv(OUT/"summary.csv",index=False)
base=df[~df.strategy.str.endswith("_stress")].copy()
rob=[]
for _,r in base.iterrows():
 s=df[df.strategy.eq(r.strategy.replace("_base","_stress"))]
 if not s.empty and r.trades>=20 and (r.profit_factor or 0)>=1.2 and r.positive_years>=3 and (s.iloc[0].profit_factor or 0)>=1.05 and s.iloc[0].positive_years>=3:rob.append(r.strategy)
summary={"calibration":{"lo":float(lo),"hi":float(hi),"rv20_median":rvmed},"validation":configs,"robust":rob,"holdout_opened":False}
(OUT/"summary.json").write_text(json.dumps(summary,indent=2));print("FINAL_V07_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_V07_END")
