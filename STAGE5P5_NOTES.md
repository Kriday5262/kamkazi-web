# Stage 5.5 — Multiple connected Google accounts per user

## What changed

- **Schema**: no migration needed. `google_accounts` has PK `id` + non-unique index on
  `user_id` — multiple rows per user were already supported. Verified `calendar_events.google_event_id`
  holds `"<calendarId>|<eventId>"` scoped per `google_account_id` (upserts key on account id + key),
  so two accounts subscribing to the SAME calendar produce two independent event rows (verified:
  `shared@group.calendar.google.com` synced from both mock accounts → 2 rows per event id).
- **Connect flow** (`src/routes/api/google/callback.handler.ts`): dedupe by **google email**.
  Reconnecting the same Google account updates its row in place (tokens refreshed, calendars kept);
  a different email INSERTs a new `google_accounts` row. Multiple accounts share one OAuth client
  (client id/secret still persisted in `user_settings` JSON by `/api/google/auth`).
- **Sync** (`src/server/google-sync.server.ts`): `syncDueGoogleAccounts()` loops ALL rows; each
  account syncs independently with its own `last_synced_ts`, its own token refresh
  (`getFreshAccessToken` per row) and its own `last_status` (`ok (N calendars)` / `revoked` /
  `error: …`). One account's failure never blocks the others (per-account try/catch).
- **Settings UI** (`src/routes/settings.tsx`): `GoogleCalendarCard` now renders ONE CARD PER
  CONNECTED ACCOUNT (email, status, last sync, per-account calendar multi-select, per-account
  Disconnect/Reconnect) plus a single `+ Connect another Google account` button at the bottom.
  The first-connect credentials form only shows when no account is connected yet (credentials are
  stored in user_settings after the first connect).
- **API** (`/api/google/calendars`): GET returns `{ connected, accounts: [...] }` (per-account
  calendars/status/selection). POST actions take `accountId` (saveSelection / sync / disconnect);
  omitting `accountId` falls back to the first account for back-compat. Disconnect deletes only
  that account's row + its google-sourced events (`google_account_id = acct.id`).
- **AI tools**: `list_events_day` already filters by `user_id` only — events from ALL connected
  accounts are searchable. `create_event` still writes local events (not pushed to Google).

## Disconnect semantics

Disconnecting account X deletes X's `google_accounts` row and every `calendar_events` row with
`google_account_id = X`. Other accounts' rows and events are untouched (verified).

## Dedupe rules

| Callback arrives with | Result |
|---|---|
| same google email as an existing row | that row updated (new tokens, same id/calendars/events) |
| different google email | new row inserted, default selection = email-ish calendars |
| calendar discovery failed (empty email) | new row with empty email (shows "Connected") |

## Verification (mocked, 2026-09-07)

`scripts/mock_google_server.py` (local mock of Google's token + calendar API on port 8811) +
`scripts/test_multacc*.py` running against a throwaway app container (`kamkazi-app-mctest`,
`GOOGLE_TOKEN_BASE`/`GOOGLE_API_BASE` seams) sharing the prod DB:

- Connected 2 mock accounts (mock.personal@gmail.com, mock.work@company.com) + 1 that 401s.
- Sync tick: 4 events per mock account landed in `calendar_events` with correct per-account
  attribution; shared calendar coexisted across both accounts without id collision.
- Failure isolation: mock account with an invalid token → `last_status='revoked'`; other accounts
  and the REAL account (NStarX Inc., 34 events) unaffected (event counts identical before/after).
- Reconnect same email → row count unchanged (3→3), 1 row for that email (dedupe ok).
- Disconnect one mock account via the Settings UI (Playwright) → only its card + events removed;
  real account card and `+ Connect another Google account` remained.
- Screenshot: /tmp/settings_multacc_after.png (2 cards + connect-another + "disconnected" toast).
- All mock rows/events deleted afterwards; DB back to exactly 1 account / 34 events.

## Test helpers kept in repo

- `scripts/mock_google_server.py` — mock Google OAuth/Calendar API (port via `MOCK_GOOGLE_PORT`).
- `scripts/test_multacc.py`, `test_multacc2.py`, `test_multacc3.py` — API-level multi-account tests
  (throwaway container; run only when testing, they touch the shared prod DB).
- `scripts/test_multacc_ui.py` — Playwright check (requires the mock accounts to exist).