"""Stage 5.5 — multi-account verification (mocked OAuth, prod DB container).

Uses a throwaway app container (kamkazi-app-mctest) sharing the prod DB, with
GOOGLE_TOKEN_BASE/GOOGLE_API_BASE pointed at the host mock server. The real
prod app container and the user's real Google connection are untouched.
"""
import json
import os
import subprocess
import time
import urllib.request
from datetime import datetime, timezone

BASE = "http://127.0.0.1:8812"
PG = ["docker", "exec", "kamkazi-pg-prod", "psql", "-U", "kamkazi", "-d", "kamkazi", "-t", "-A", "-c"]

HOST_IP = subprocess.run(["getent", "hosts", "host.docker.internal"], capture_output=True, text=True)


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"cmd failed: {cmd}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def sql(q):
    return sh(PG + [q])


def host_ip():
    r = subprocess.run(["ip", "-4", "route", "show", "default"], capture_output=True, text=True)
    return r.stdout.split()[2] if r.stdout else "172.17.0.1"


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def api(path, token, method="GET", body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("cookie", f"kamkazi_session={token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=30) as res:
            raw = res.read().decode() or "{}"
            try:
                return res.status, json.loads(raw)
            except json.JSONDecodeError:
                return res.status, {"_raw": raw[:300]}
    except urllib.error.HTTPError as e:
        raw = e.read().decode() or "{}"
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"_raw": raw[:300]}


def mint_cookie():
    import hmac as hm
    import base64

    secret = open("/tmp/kamkazi/.env").read()
    sec = [l.split("=", 1)[1] for l in secret.splitlines() if l.startswith("SESSION_SECRET=")][0]
    payload = {"uid": "u_shantanu", "username": "Shantanu", "exp": int(time.time()) + 3600}
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(
        hm.new(sec.encode(), body.encode(), "sha256").digest()
    ).decode().rstrip("=")
    import urllib.parse
    return urllib.parse.quote(f"{body}.{sig}", safe="")


def counts():
    rows = sql(
        "select google_email, count(*) from calendar_events ce join google_accounts ga "
        "on ce.google_account_id = ga.id group by 1 order by 1;"
    )
    return rows or "(none)"


def main():
    real_email = sql("select google_email from google_accounts limit 1;")
    log(f"REAL account (must be untouched): {real_email}")
    real_before = sql(
        f"select count(*) from calendar_events ce join google_accounts ga on ce.google_account_id=ga.id where ga.google_email='{real_email}';"
    )
    log(f"real account events before: {real_before}")
    accts_before = sql("select count(*) from google_accounts;")
    log(f"google_accounts rows before: {accts_before}")

    ip = host_ip()
    gw = subprocess.run(
        ["docker", "network", "inspect", "kamkazi-prod_default",
         "--format", "{{(index .IPAM.Config 0).Gateway}}"],
        capture_output=True, text=True,
    ).stdout.strip()
    mock_ip = gw or ip
    log(f"mock ip for containers: {mock_ip}")
    # throwaway app container on 8812, sharing prod DB + env, mock endpoints
    sh([
        "docker", "rm", "-f", "kamkazi-app-mctest",
    ])
    sh([
        "docker", "run", "-d", "--name", "kamkazi-app-mctest",
        "--network", "kamkazi-prod_default",
        "-p", "127.0.0.1:8812:8812",
        "-e", "DATABASE_URL=postgres://kamkazi:kamkazi@kamkazi-pg-prod:5432/kamkazi",
        "-e", "SESSION_SECRET=" + [l.split("=", 1)[1] for l in open("/tmp/kamkazi/.env") if l.startswith("SESSION_SECRET=")][0].strip(),
        "-e", "GOOGLE_TOKEN_BASE=" + f"http://{mock_ip}:8811",
        "-e", "GOOGLE_API_BASE=" + f"http://{mock_ip}:8811",
        "-e", "NITRO_PORT=8812",
        "kamkazi-app",
    ])
    time.sleep(3)

    # wait for readiness
    for _ in range(20):
        try:
            urllib.request.urlopen(BASE + "/login", timeout=3)
            break
        except Exception:
            time.sleep(1)
    log("test container up")

    cookie = mint_cookie()

    # --- Connect mock account A (real OAuth flow via mocked endpoints) ---
    st, auth = api("/api/google/auth", cookie)
    assert st in (302, 200, 307), (st, auth)
    log(f"auth endpoint status={st}")

    # Simulate the callback exactly as Google would: GET /api/google/callback?code=..&state=..
    # We can't mint a valid signed state from outside, so call the handler's seam:
    # the callback verifies state HMAC; mint one with the same SESSION_SECRET.
    import hashlib
    import hmac as hm

    sec = [l.split("=", 1)[1] for l in open("/tmp/kamkazi/.env") if l.startswith("SESSION_SECRET=")][0].strip()
    import base64 as b64

    nonce = b64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
    sig = b64.urlsafe_b64encode(
        hm.new(sec.encode(), f"gstate:{nonce}".encode(), "sha256").digest()
    ).decode().rstrip("=")
    state = f"{nonce}.{sig}"

    st, _ = api(f"/api/google/callback?code=tok_mock_a&state={state}", cookie)
    log(f"callback A status={st}")
    st, body = api("/api/google/calendars", cookie)
    log(f"accounts after A: {json.dumps(body)[:400]}")
    assert any(a["googleEmail"] == "mock.personal@gmail.com" for a in body.get("accounts", []))

    # --- Connect mock account B ---
    nonce2 = b64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
    sig2 = b64.urlsafe_b64encode(
        hm.new(sec.encode(), f"gstate:{nonce2}".encode(), "sha256").digest()
    ).decode().rstrip("=")
    st, _ = api(f"/api/google/callback?code=tok_mock_b&state={nonce2}.{sig2}", cookie)
    log(f"callback B status={st}")
    st, body = api("/api/google/calendars", cookie)
    emails = [a["googleEmail"] for a in body.get("accounts", [])]
    log(f"accounts after B: {emails}")
    assert "mock.personal@gmail.com" in emails and "mock.work@company.com" in emails

    # --- Connect mock account C (will 401 on calendar list → error status) ---
    nonce3 = b64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
    sig3 = b64.urlsafe_b64encode(
        hm.new(sec.encode(), f"gstate:{nonce3}".encode(), "sha256").digest()
    ).decode().rstrip("=")
    st, _ = api(f"/api/google/callback?code=tok_mock_bad&state={nonce3}.{sig3}", cookie)
    st, body = api("/api/google/calendars", cookie)
    bad = [a for a in body.get("accounts", []) if a["googleEmail"] == "mock.revoked@old.com"]
    log(f"bad account payload: {json.dumps(bad)}")

    # --- Force sync each mock account ---
    st, body = api("/api/google/calendars", cookie)
    for a in body["accounts"]:
        if a["googleEmail"].startswith("mock."):
            st, r = api("/api/google/calendars", cookie, "POST", {"action": "sync", "accountId": a["id"]})
            log(f"sync {a['googleEmail']}: {st} {r}")

    rows = sql(
        "select ga.google_email, ce.calendar, ce.title from calendar_events ce "
        "join google_accounts ga on ce.google_account_id=ga.id where ga.google_email like 'mock.%' order by 1,2 limit 20;"
    )
    log("mock events after sync:\n" + rows)
    per = sql(
        "select ga.google_email, count(*) from calendar_events ce join google_accounts ga "
        "on ce.google_account_id=ga.id where ga.google_email like 'mock.%' group by 1;"
    )
    log("per-account mock event counts:\n" + per)
    assert "mock.personal@gmail.com" in per and "mock.work@company.com" in per

    # --- Shared-calendar collision check: same cal id from two accounts ---
    shared = sql(
        "select ce.google_event_id, count(distinct ce.google_account_id) from calendar_events ce "
        "where ce.google_event_id like 'shared@group.calendar.google.com|%' group by 1 order by 1;"
    )
    log(f"shared calendar per-account rows (expect 2 each):\n{shared}")

    # --- AI search across accounts (list_events_day has no account filter) ---
    date = (datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    # mock events are day+1/day+2; check the events table directly that both accounts' events share user scoping
    both = sql(
        "select count(distinct ga.google_email) from calendar_events ce join google_accounts ga "
        "on ce.google_account_id=ga.id where ga.google_email like 'mock.%';"
    )
    log(f"distinct mock accounts with events (expect 2): {both}")

    # --- Token refresh independence: expire token on B, make refresh fail for B ---
    sql("update google_accounts set token_expires_at = now() - interval '1 hour' where google_email='mock.work@company.com';")
    # mock server returns 400 invalid_grant for refresh (fail_refresh set via header not used here;
    # instead delete the refresh token to simulate revoked)
    sql("update google_accounts set refresh_token_enc = null where google_email='mock.work@company.com';")
    st, body = api("/api/google/calendars", cookie)
    b = [a for a in body["accounts"] if a["googleEmail"] == "mock.work@company.com"][0]
    log(f"B after forced-refresh-fail: status={b['status']} listError={b.get('listError')}")
    a_ = [a for a in body["accounts"] if a["googleEmail"] == "mock.personal@gmail.com"][0]
    # A should still fetch calendars fine (its token may have expired; refresh works on mock server)
    log(f"A unaffected: status={a_['status']} calendars={len(a_['calendars'])}")

    # --- Disconnect B only ---
    st, r = api("/api/google/calendars", cookie, "POST", {"action": "disconnect", "accountId": b["id"]})
    log(f"disconnect B: {st} {r}")
    st, body = api("/api/google/calendars", cookie)
    emails = [a["googleEmail"] for a in body.get("accounts", [])]
    log(f"accounts after disconnect B: {emails}")
    assert "mock.work@company.com" not in emails and "mock.personal@gmail.com" in emails
    b_events = sql("select count(*) from calendar_events ce join google_accounts ga on ce.google_account_id=ga.id where ga.google_email='mock.work@company.com';")
    log(f"B events after disconnect (expect 0 rows → count query returns nothing): {b_events or '0'}")

    real_after = sql(
        f"select count(*) from calendar_events ce join google_accounts ga on ce.google_account_id=ga.id where ga.google_email='{real_email}';"
    )
    log(f"real account events after: {real_after} (before {real_before})")
    assert real_after == real_before, "REAL ACCOUNT EVENTS CHANGED!"
    st, body = api("/api/google/calendars", cookie)
    assert real_email in [a["googleEmail"] for a in body.get("accounts", [])]
    log("REAL account intact ✓")

    # --- Playwright UI check happens outside; leave mock accounts for it ---
    with open("/tmp/mctest_state.json", "w") as f:
        json.dump({
            "cookie": cookie,
            "real_email": real_email,
            "accounts": body.get("accounts", []),
            "mockA_id": a_["id"],
        }, f)
    log("state saved")


if __name__ == "__main__":
    main()