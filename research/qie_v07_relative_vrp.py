from __future__ import annotations

import json, math, os, sys
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.append("research")
import qie_v06_relative_value as v6

CAL_START=v6.CAL_START; CAL_END=v6.CAL_END
VAL_START=v6.VAL_START; VAL_END=v6.VAL_END
TAIL_Q=v6.TAIL_Q
OUT_DIR=Path(os.environ.get("QIE_OUT_DIR","qie_v07_results")); OUT_DIR.mkdir(parents=True,exist_ok=True)

def add_har_features(u: pd.DataFrame):
    z=u.copy()

    # Data-quality fix only: prefer adjusted_close when it actually has a usable
    # calibration history; otherwise use close. This does not change the HAR
    # specification, signal, thresholds, or validation gate.
    close_px=pd.to_numeric(z["close"],errors="coerce")
    px=close_px
    price_source="close"
    if "adjusted_close" in z.columns:
        adj=pd.to_numeric(z["adjusted_close"],errors="coerce")
        cal_adj=adj.loc[CAL_START:CAL_END]
        cal_close=close_px.loc[CAL_START:CAL_END]
        required=max(500,int(.80*cal_close.notna().sum()))
        if cal_adj.notna().sum()>=required and (cal_adj.dropna()>0).all():
            px=adj
            price_source="adjusted_close"

    r=np.log(px/px.shift(1))
    r=r.replace([np.inf,-np.inf],np.nan)
    for n in (5,20,60):
        z[f"rv{n}"]=r.rolling(n).std(ddof=1)*math.sqrt(252)
    fwd_var=r.pow(2).shift(-1)[::-1].rolling(20).mean()[::-1]*252
    z["fwd_rv20"]=np.sqrt(fwd_var.clip(lower=1e-12))
    cal=z.loc[CAL_START:CAL_END,["rv5","rv20","rv60","fwd_rv20"]].replace([np.inf,-np.inf],np.nan).dropna()
    cal=cal[(cal>0).all(axis=1)]
    if len(cal)<500:
        raise RuntimeError(f"HAR calibration has only {len(cal)} usable rows using {price_source}")

    X=np.column_stack([np.ones(len(cal)),np.log(cal.rv5),np.log(cal.rv20),np.log(cal.rv60)])
    y=np.log(cal.fwd_rv20.to_numpy())
    beta,*_=np.linalg.lstsq(X,y,rcond=None)
    good=z[["rv5","rv20","rv60"]].gt(0).all(axis=1)
    vals=np.full(len(z),np.nan)
    Xall=np.column_stack([np.ones(int(good.sum())),np.log(z.loc[good,"rv5"]),np.log(z.loc[good,"rv20"]),np.log(z.loc[good,"rv60"])])
    vals[np.where(good)[0]]=np.exp(Xall@beta)
    z["har_rv20"]=np.clip(vals,.03,1.50)
    pred=np.exp(X@beta)
    meta={"n":int(len(cal)),"price_source":price_source,"beta":beta.tolist(),
          "rmse":float(np.sqrt(np.mean((pred-cal.fwd_rv20.to_numpy())**2))),
          "corr":float(np.corrcoef(pred,cal.fwd_rv20.to_numpy())[0,1])}
    return z,meta

def atm_features(opt: pd.DataFrame):
    out={}
    for d,day in opt.groupby("date",sort=True):
        a=v6.select_atm_straddle(day,42,35,50)
        if a is not None: out[d]=a
    return out

def main():
    tickers=["SPY","QQQ","IWM"]
    under0={t:v6.load_underlying(t) for t in tickers}
    har_meta={}
    under={}
    for t in tickers:
        under[t],har_meta[t]=add_har_features(under0[t])

    opts={t:v6.load_options(t) for t in tickers}
    atm={t:atm_features(opts[t]) for t in tickers}
    indices={t:v6.build_quote_index(opts[t]) for t in tickers}

    thresholds={}; metric_maps={}
    for other in ["QQQ","IWM"]:
        vals=[]; mmap={}
        common=sorted(set(atm["SPY"])&set(atm[other]))
        for d in common:
            if d not in under["SPY"].index or d not in under[other].index: continue
            fs=float(under["SPY"].loc[d,"har_rv20"]); fo=float(under[other].loc[d,"har_rv20"])
            if not(np.isfinite(fs) and np.isfinite(fo) and fs>0 and fo>0): continue
            m=math.log(atm[other][d]["iv"]/fo)-math.log(atm["SPY"][d]["iv"]/fs)
            mmap[d]=m
            if CAL_START<=d<=CAL_END: vals.append(m)
        thresholds[other]=v6.quantiles(vals)
        metric_maps[other]=mmap

    calibration={"period":[str(CAL_START.date()),str(CAL_END.date())],"tail_quantile":TAIL_Q,
                 "har":har_meta,"thresholds":{k:list(v) for k,v in thresholds.items()},
                 "n":{k:sum(1 for d in metric_maps[k] if CAL_START<=d<=CAL_END) for k in thresholds}}
    (OUT_DIR/"calibration.json").write_text(json.dumps(calibration,indent=2))
    print("CALIBRATION",json.dumps(calibration),flush=True)

    base_dates=sorted(d for d in under["SPY"].index if VAL_START<=d<=VAL_END)
    reports=[]; eligible=[]
    for other in ["QQQ","IWM"]:
        lo,hi=thresholds[other]; mmap=metric_maps[other]
        sig=[d for d,m in mmap.items() if VAL_START<=d<=VAL_END and (m<=lo or m>=hi)]
        def make_builder(other=other,lo=lo,hi=hi,mmap=mmap):
            def builder(d):
                a=atm["SPY"].get(d); b=atm[other].get(d)
                if not a or not b:return None
                m=mmap[d]; rich_other=m>=hi
                qo,qs=v6.integer_vega_match(b["vega"],a["vega"],2)
                so=-1 if rich_other else 1; ss=1 if rich_other else -1
                legs=[
                    v6.Leg(other,b["call_id"],so,qo,b["expiration"]),v6.Leg(other,b["put_id"],so,qo,b["expiration"]),
                    v6.Leg("SPY",a["call_id"],ss,qs,a["expiration"]),v6.Leg("SPY",a["put_id"],ss,qs,a["expiration"])
                ]
                return legs,{"signal":float(m),"direction":f"short_{other.lower()}_relative_vrp" if rich_other else f"long_{other.lower()}_relative_vrp",
                             f"{other.lower()}_qty":qo,"spy_qty":qs}
            return builder
        name=f"{other.lower()}_spy_relative_vrp"; builder=make_builder()
        m,t=v6.run_nonoverlap(name,sig,builder,indices,under,base_dates,v6.BASE_HEDGE_BPS,v6.BASE_OPT_PENALTY)
        ms,ts=v6.run_nonoverlap(name+"_stress",sig,builder,indices,under,base_dates,v6.STRESS_HEDGE_BPS,v6.STRESS_OPT_PENALTY)
        m.update({"stress_trades":ms.get("trades",0),"stress_profit_factor":ms.get("profit_factor"),
                  "stress_avg_pnl":ms.get("avg_pnl"),"stress_total_pnl":ms.get("total_pnl"),
                  "stress_positive_years":ms.get("positive_years",0)})
        passes=(m.get("trades",0)>=25 and (m.get("profit_factor") or 0)>=1.20 and (m.get("avg_pnl") or -1)>0
                and m.get("positive_years",0)>=3 and (m.get("stress_profit_factor") or 0)>=1.05
                and (m.get("stress_avg_pnl") or -1)>0 and m.get("stress_positive_years",0)>=3)
        m["passes_gate"]=bool(passes)
        if passes:eligible.append(name)
        reports.append(m)
        t.to_csv(OUT_DIR/f"{name}_trades.csv",index=False); ts.to_csv(OUT_DIR/f"{name}_stress_trades.csv",index=False)
        print("VALIDATION",json.dumps(m),flush=True)

    summary={"protocol":{"calibration":[str(CAL_START.date()),str(CAL_END.date())],
                         "validation":[str(VAL_START.date()),str(VAL_END.date())],
                         "holdout":"2023-2025 SEALED","signal":"relative implied/forecast-realized volatility risk premium",
                         "gate":{"min_trades":25,"profit_factor":1.20,"positive_years":3,"stress_profit_factor":1.05,"stress_positive_years":3}},
             "calibration":calibration,"validation":reports,"eligible_for_holdout":eligible,"holdout_opened":False}
    pd.DataFrame(reports).to_csv(OUT_DIR/"validation_summary.csv",index=False)
    (OUT_DIR/"summary.json").write_text(json.dumps(summary,indent=2))
    print("FINAL_V07_BEGIN");print(json.dumps(summary,indent=2));print("FINAL_V07_END")

if __name__=="__main__":main()
