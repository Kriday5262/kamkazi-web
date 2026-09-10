
import subprocess, json, urllib.request, time, base64, hmac as hm, urllib.parse, os, re

def sql(q):
    return subprocess.run(["docker","exec","kamkazi-pg-prod","psql","-U","kamkazi","-d","kamkazi","-t","-A","-c",q],capture_output=True,text=True).stdout.strip()

sec = [l.split("=",1)[1] for l in open("/tmp/kamkazi/.env") if l.startswith("SESSION_SECRET=")][0].strip()
payload={"uid":"u_shantanu","username":"Shantanu","exp":int(time.time())+3600}
body=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
sig=base64.urlsafe_b64encode(hm.new(sec.encode(),body.encode(),"sha256").digest()).decode().rstrip("=")
cookie=urllib.parse.quote(f"{body}.{sig}",safe="")

# 1) break C's token: expire + drop refresh token
sql("update google_accounts set refresh_token_enc=null, token_expires_at=now() - interval '1 hour' where google_email='';")
# C has empty email (bad account, calendarList 401'd during callback). grab its id:
cid = sql("select id from google_accounts where google_email='' limit 1;")
print("C id:", cid)
# C's access token was stored (real mock token tok_mock_bad). Its calendarList returns 401 from mock => 'error: UNAUTHORIZED'
# Force sync C:
def api(path, method="GET", body=None):
    req=urllib.request.Request("http://127.0.0.1:8812"+path, method=method)
    req.add_header("cookie", f"kamkazi_session={cookie}")
    data=None
    if body is not None:
        data=json.dumps(body).encode(); req.add_header("content-type","application/json")
    try:
        with urllib.request.urlopen(req,data,timeout=60) as res: return res.status, res.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()

st,r = api("/api/google/calendars","POST",{"action":"sync","accountId":cid})
print("sync C:",st,r)
st,r = api("/api/google/calendars")
d=json.loads(r)
for a in d["accounts"]:
    print(a["googleEmail"], "|", a["status"], "| listError:", a.get("listError"), "| lastSynced:", a["lastSynced"] is not None)

# 2) expire A's token, sync only C again — A must stay 'ok'
sql("update google_accounts set token_expires_at=now() - interval '1 hour' where google_email='mock.personal@gmail.com';")
st,r = api("/api/google/calendars","POST",{"action":"sync","accountId":cid})
print("sync C again:",st,r)
d=json.loads(api("/api/google/calendars")[1])
for a in d["accounts"]:
    print("after C-only sync:",a["googleEmail"],"|",a["status"])

# 3) reconnect SAME email A (dedupe → same row updated, not duplicated)
before = sql("select count(*) from google_accounts;")
nonce=base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
gsig=base64.urlsafe_b64encode(hm.new(sec.encode(),f"gstate:{nonce}".encode(),"sha256").digest()).decode().rstrip("=")
st,_=api(f"/api/google/callback?code=tok_mock_a&state={nonce}.{gsig}")
after = sql("select count(*) from google_accounts;")
print(f"reconnect same email: rows {before} -> {after} (expect equal)")
rowcount = sql("select count(*) from google_accounts where google_email='mock.personal@gmail.com';")
print("rows for mock.personal@gmail.com (expect 1):", rowcount)
assert before==after and rowcount=="1"
print("OK-401-and-dedupe")
