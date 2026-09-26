import json, requests, pandas as pd, yfinance as yf
API="https://www.dolthub.com/api/v1alpha1/post-no-preference/options/master"
def dolt(sql):
    r=requests.get(API,params={"q":sql},timeout=60); r.raise_for_status()
    j=r.json()
    if j.get("query_execution_status")!="Success": raise RuntimeError(j.get("query_execution_message"))
    return pd.DataFrame(j["rows"])
for t in ["AAPL","NVDA","TSLA"]:
    print("EARNINGS",t)
    try:
        e=yf.Ticker(t).get_earnings_dates(limit=40)
        print(e.to_string(max_rows=50))
        if e is not None and len(e):
            idx=pd.to_datetime(e.index)
            old=[d for d in idx if pd.Timestamp("2019-01-01",tz=d.tz)<=d<=pd.Timestamp("2022-12-31 23:59",tz=d.tz)]
            if old:
                ev=old[-1].date().isoformat()
                lo=(pd.Timestamp(ev)-pd.Timedelta(days=5)).date().isoformat()
                hi=(pd.Timestamp(ev)+pd.Timedelta(days=5)).date().isoformat()
                q=f"SELECT DISTINCT date FROM option_chain WHERE act_symbol='{t}' AND date BETWEEN '{lo}' AND '{hi}' ORDER BY date"
                print("OPTION_DATES",t,ev,dolt(q).to_dict("records"))
    except Exception as ex: print("ERR",t,repr(ex))
