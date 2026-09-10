"""Mock Google OAuth + Calendar API server for Stage 5.5 verification.

Endpoints (mirroring real Google shapes):
- POST /token                     → token JSON; supports authorization_code and refresh_token grants.
- GET  /calendar/v3/users/me/calendarList → calendars for the bearer token's mock user.
- GET  /calendar/v3/calendars/<cal>/events → mock events.

Mock users (by access token):
- tok_mock_a → mock.personal@gmail.com   (calendars: mock.personal@gmail.com primary, shared@group.calendar.google.com)
- tok_mock_b → mock.work@company.com     (calendars: mock.work@company.com primary, shared@group.calendar.google.com)
- tok_mock_bad → user whose calendarList/events return 401 (revoked scenario)

ENV knobs:
- MOCK_FAIL_REFRESH=1  → token endpoint returns 400 invalid_grant for refresh_token grants.
"""
import json
import re
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

USERS = {
    "tok_mock_a": {
        "email": "mock.personal@gmail.com",
        "cals": [
            {"id": "mock.personal@gmail.com", "summary": "mock.personal@gmail.com", "primary": True},
            {"id": "shared@group.calendar.google.com", "summary": "Shared Family"},
        ],
    },
    "tok_mock_b": {
        "email": "mock.work@company.com",
        "cals": [
            {"id": "mock.work@company.com", "summary": "mock.work@company.com", "primary": True},
            {"id": "shared@group.calendar.google.com", "summary": "Shared Family"},
        ],
    },
    "tok_mock_bad": {"email": "mock.revoked@old.com", "cals": []},
}

fail_refresh = False


def events_for(cal_id: str, tag: str):
    now = datetime.now(timezone.utc)
    mk = lambda d, h: (now + timedelta(days=d)).strftime("%Y-%m-%dT%H:00:00+00:00")
    return {
        "items": [
            {
                "id": f"evt_{tag}_{cal_id.split('@')[0]}_1",
                "status": "confirmed",
                "summary": f"[{tag}] Event on {cal_id} day+1",
                "start": {"dateTime": mk(1, 0)},
                "end": {"dateTime": mk(1, 1)},
            },
            {
                "id": f"evt_{tag}_{cal_id.split('@')[0]}_2",
                "status": "confirmed",
                "summary": f"[{tag}] All-day on {cal_id} day+2",
                "start": {"date": (now + timedelta(days=2)).strftime("%Y-%m-%d")},
            },
        ]
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global fail_refresh
        if self.path.startswith("/token"):
            fail_refresh = "1" in (self.headers.get("x-mock-fail-refresh") or "")
            ln = int(self.headers.get("content-length") or 0)
            form = dict(
                p.split("=", 1) for p in self.rfile.read(ln).decode().split("&") if "=" in p
            )
            grant = form.get("grant_type", "")
            if grant == "authorization_code":
                tok = form.get("code", "tok_mock_a")
                self._send(200, {
                    "access_token": tok,
                    "refresh_token": tok + "_rt",
                    "expires_in": 3600,
                    "token_type": "Bearer",
                })
            elif grant == "refresh_token":
                if fail_refresh:
                    self._send(400, {"error": "invalid_grant"})
                else:
                    rt = form.get("refresh_token", "tok_mock_a_rt")
                    self._send(200, {
                        "access_token": rt.replace("_rt", ""),
                        "expires_in": 3600,
                        "token_type": "Bearer",
                    })
            else:
                self._send(400, {"error": "unsupported_grant_type"})
        else:
            self._send(404, {"error": "not found"})

    def do_GET(self):
        auth = self.headers.get("authorization") or ""
        tok = auth.replace("Bearer ", "").strip()
        user = USERS.get(tok)
        if user is None:
            self._send(401, {"error": {"code": 401}})
            return
        if self.path.startswith("/calendar/v3/users/me/calendarList"):
            self._send(200, {"items": user["cals"]})
            return
        m = re.match(r"^/calendar/v3/calendars/([^/]+)/events", self.path)
        if m:
            from urllib.parse import unquote

            self._send(200, events_for(unquote(m.group(1)), user["email"]))
            return
        self._send(404, {"error": "not found"})


if __name__ == "__main__":
    import os

    HTTPServer(("0.0.0.0", int(os.environ.get("MOCK_GOOGLE_PORT", "8799"))), Handler).serve_forever()