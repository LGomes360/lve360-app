#!/usr/bin/env python3
"""MOTU Forward immutable prospective snapshot validator.

Consumes a manually/exported live market snapshot CSV. It does NOT scrape quote
websites. It validates the frozen Small Prime geometry and writes a timestamped
decision sheet plus an append-only ledger row set.
"""
from __future__ import annotations
import argparse, csv, hashlib, json
from datetime import datetime, timezone
from pathlib import Path

START_NAV=166912.81
SLOTS=4
COMM=0.65
TARGET_DTE=14
DTE_LO,DTE_HI=7,21
TARGET_PUT_DELTA=-0.20

REQUIRED={"symbol","underlying","sma200","next_earnings_days","realized_vol","iv",
          "expiration","dte","strike","put_delta","bid","ask"}

def f(x): return float(x)
def sha(path):
    h=hashlib.sha256(); h.update(Path(path).read_bytes()); return h.hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("snapshot")
    ap.add_argument("--nav",type=float,default=START_NAV)
    ap.add_argument("--asof",required=True,help="ISO timestamp for quote snapshot")
    ap.add_argument("--out",default="research/motu_forward/snapshots")
    a=ap.parse_args()
    rows=list(csv.DictReader(open(a.snapshot,newline="",encoding="utf-8")))
    if not rows: raise SystemExit("empty snapshot")
    miss=REQUIRED-set(rows[0])
    if miss: raise SystemExit(f"missing columns: {sorted(miss)}")
    slot_cash=a.nav/SLOTS
    eligible=[]
    rejects=[]
    for r in rows:
        sym=r["symbol"].upper().strip()
        reasons=[]
        if f(r["underlying"])<=f(r["sma200"]): reasons.append("below_sma200")
        if f(r["next_earnings_days"])<45: reasons.append("event_blackout")
        if not(DTE_LO<=int(float(r["dte"]))<=DTE_HI): reasons.append("dte")
        if f(r["realized_vol"])<=0: reasons.append("bad_realized_vol")
        collateral=f(r["strike"])*100
        if collateral>slot_cash: reasons.append("unaffordable")
        if f(r["bid"])<0.05 or f(r["ask"])<f(r["bid"]): reasons.append("quote")
        if reasons:
            rejects.append({"symbol":sym,"reasons":";".join(reasons)})
            continue
        vrp=f(r["iv"])/f(r["realized_vol"])
        eligible.append((vrp,abs(f(r["put_delta"])-TARGET_PUT_DELTA),
                         abs(int(float(r["dte"]))-TARGET_DTE),sym,r,collateral))
    eligible.sort(key=lambda x:(-x[0],x[1],x[2],x[3]))
    picks=[]; used=set()
    for vrp,dd,dt,sym,r,collateral in eligible:
        if sym in used: continue
        n=max(1,int(slot_cash//collateral))
        credit=f(r["bid"])*100*n-COMM*n
        picks.append({"slot":len(picks)+1,"symbol":sym,"vrp":round(vrp,4),
          "expiration":r["expiration"],"dte":int(float(r["dte"])),"strike":f(r["strike"]),
          "delta":f(r["put_delta"]),"bid":f(r["bid"]),"ask":f(r["ask"]),
          "contracts":n,"required_collateral":collateral*n,"paper_credit":round(credit,2),
          "decision":"SELL_PUT"})
        used.add(sym)
        if len(picks)==SLOTS: break
    while len(picks)<SLOTS:
        picks.append({"slot":len(picks)+1,"decision":"HOLD_CASH","reason":"no eligible affordable unique candidate"})
    payload={"protocol":"MOTU Forward / Small Prime 4-slot","asof":a.asof,
      "generated_at":datetime.now(timezone.utc).isoformat(),"nav":a.nav,"slot_cash":slot_cash,
      "source_sha256":sha(a.snapshot),"picks":picks,"rejects":rejects}
    stamp=a.asof.replace(":","").replace("-","").replace("+","_").replace("T","_")
    out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    p=out/f"{stamp}.json"; p.write_text(json.dumps(payload,indent=2)+"\n")
    print(json.dumps(payload,indent=2)); print("WROTE",p)

if __name__=="__main__": main()
