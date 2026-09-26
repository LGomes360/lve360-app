import json, requests

def q(repo, sql):
    url=f"https://www.dolthub.com/api/v1alpha1/post-no-preference/{repo}/master"
    r=requests.get(url, params={"q":sql}, timeout=60)
    r.raise_for_status()
    j=r.json()
    print("REPO",repo,"SQL",sql)
    print(json.dumps(j,indent=2)[:30000])

for repo in ["options","calendar-estimates-statements"]:
    for sql in ["SHOW TABLES;", "SELECT * FROM option_chain LIMIT 3;" if repo=="options" else "SELECT * FROM earnings_calendar LIMIT 3;"]:
        try:q(repo,sql)
        except Exception as e:print("ERR",repo,sql,repr(e))

# Probe likely earnings table names returned by SHOW TABLES manually from result if possible via information_schema.
try:
    q("calendar-estimates-statements","SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE();")
except Exception as e: print("ERR tables",repr(e))
