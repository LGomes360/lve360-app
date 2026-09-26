import json, os, inspect, pkgutil
import pandas as pd
import HistoricalEarningsData as hed

print("MODULE",hed.__file__)
print("MEMBERS",[x for x in dir(hed) if not x.startswith("_")])
try:
    print("SOURCE",inspect.getsource(hed)[:20000])
except Exception as e: print("SOURCE_ERR",repr(e))

data=hed.load_earnings_data()
print("SHAPE",data.shape)
print("COLUMNS",list(data.columns))
print("HEAD")
print(data.head(10).to_string())
print("TAIL")
print(data.tail(10).to_string())
for c in data.columns:
    print("DTYPE",c,str(data[c].dtype),"MISSING",int(data[c].isna().sum()),"NUNIQUE",int(data[c].nunique(dropna=True)))
if "symbol" in data:
    print("SYMBOLS",sorted(data.symbol.dropna().astype(str).unique())[:500])
if "earnings_date" in data:
    dt=pd.to_datetime(data.earnings_date,errors="coerce")
    print("DATE_RANGE",str(dt.min()),str(dt.max()))
    print("COUNTS_YEAR",dt.dt.year.value_counts().sort_index().to_dict())
if "implied_volatility" in data:
    iv=pd.to_numeric(data.implied_volatility,errors="coerce")
    print("IV_DESC",iv.describe(percentiles=[.01,.05,.25,.5,.75,.95,.99]).to_dict())
    print("IV_BAD",int((iv<=0).sum()),int((iv>5).sum()))
for t in ["AAPL","NVDA","TSLA","MSFT","AMZN","NFLX","AMD","ADBE","CRM","ORCL","JPM","GOOGL"]:
    if "symbol" in data:
        z=data[data.symbol.astype(str).str.upper().eq(t)].copy()
        print("TICKER",t,"N",len(z))
        if len(z):
            print(z.tail(20).to_string(index=False))
