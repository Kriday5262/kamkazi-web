
import subprocess, json, urllib.request, time, base64, hmac as hm, urllib.parse
def sql(q):
    return subprocess.run(["docker","exec","kamkazi-pg-prod","psql","-U","kamkazi","-d","kamkazi","-t","-A","-c",q],capture_output=True,text=True).stdout.strip()
sec=[l.split("=",1)[1] for l in open("/tmp/kamkazi/.env") if l.startswith("SESSION_SECRET=")][0].strip()
payload={"uid":"u_shantanu","username":"Shantanu","exp":int(time.time())+3600}
body=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
sig=base64.urlsafe_b64encode(hm.new(sec.encode(),body.encode(),"sha256").digest()).decode().rstrip("=")
cookie=open("/tmp/cookie.txt").read().strip()
def api(path, method="GET", body=None):
    req=urllib.request.Request("http://127.0.0.1:8812"+path, method=method)
    req.add_header("cookie", f"kamkazi_session={cookie}")
    data=None
    if body is not None:
        data=json.dumps(body).encode(); req.add_header("content-type","application/json")
    try:
        with urllib.request.urlopen(req,data,timeout=60) as res: return res.status,res.read().decode()
    except urllib.error.HTTPError as e: return e.code,e.read().decode()

# Baseline events per account BEFORE the failure test
base_counts = sql("select ga.google_email||':'||count(*) from calendar_events ce join google_accounts ga on ce.google_account_id=ga.id group by 1;")
print("counts before:", base_counts)

aid=sql("select id from google_accounts where google_email='mock.personal@gmail.com';")
# Set A's access token to a token the mock 401s on (tok_mock_bad), expired, with NO refresh
sql("update google_accounts set refresh_token_enc=null where google_email='mock.personal@gmail.com';")
st,r=api("/api/google/calendars","POST",{"action":"sync","accountId":aid})
print("sync A (bad token):",st,r)
d=json.loads(api("/api/google/calendars")[1])
sA=[a for a in d["accounts"] if a["id"]==aid][0]["status"]
print("A status:",sA)
assert "error" in sA.lower() or sA=="revoked", sA
# C and real unaffected
sql("update google_accounts set token_expires_at=now()-interval '1 hour' where google_email='';")
cid=sql("select id from google_accounts where google_email='';")
st,r=api("/api/google/calendars","POST",{"action":"sync","accountId":cid})
print("sync C after A failed:",st,r)
d=json.loads(api("/api/google/calendars")[1])
for a in d["accounts"]: print(" ",a["googleEmail"],"|",a["status"])
counts=sql("select ga.google_email||':'||count(*) from calendar_events ce join google_accounts ga on ce.google_account_id=ga.id group by 1;")
print("counts after:", counts)
assert counts==base_counts
print("ISOLATION-OK")
