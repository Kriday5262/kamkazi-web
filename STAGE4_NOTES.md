# Stage 4 — Calendar (ICS subscriptions, real events UI, AI calendar tools)

## What shipped

- **One-way ICS/webcal subscriptions.** Paste an `https://…` or `webcal://…` ICS URL
  in Calendar → Subscriptions (🔗 icon). The server converts `webcal://` to
  `https://`, fetches, parses, expands recurrences over the next 90 days, and
  stores occurrences in `calendar_events`. **.ics file upload** is supported for
  one-off imports.
- **15-minute auto-refresh.** In-memory scheduler inside the server process
  (`startSubscriptionScheduler()`), per-subscription `last_fetched_ts`; the
  `GET /api/calendar` handler also opportunistically syncs anything due and
  refreshes the client data every 15 min. Manual "refresh" button too.
- **UID idempotency.** Occurrences are keyed by `(userId, subscriptionId,
  icsUid, startUtc|date)`; repeated syncs never duplicate, and events that
  disappear from the feed (or fall out of the 90-day window) are removed.
- **Real events UI** on the existing (frozen-design) calendar screen:
  month/week/day view toggles, day-planning agenda pairing events with tasks
  due that day, per-source colour dots, local event create/edit/delete with
  optimistic updates (`EventEditor` modal). Times stored UTC
  (`start_utc` timestamptz-string + `date`/`start` IST bucket columns) and
  displayed in Asia/Kolkata via `Intl`.
- **Honest read-only model.** Subscribed events are flagged `readOnly` in the
  API and cannot be edited or deleted (server enforces
  `subscription_id IS NULL` on save/delete). The UI labels this clearly:
  "Read-only subscription — changes in the source calendar will sync in;
  edits here are local." Real two-way CalDAV write-back is deferred, not faked.
- **AI tools.** `list_events_day(date)` (read-only, silent) and
  `create_event(title, date, startTime?, durationMin?)` (write → confirmation
  card via the existing PendingActionCard flow, extended for create_event).
  System prompt mentions the calendar so "what's on my calendar tomorrow" works.
- **Weather auto-refresh** was already client-side every 15 min (Stage 3
  `SYNC_INTERVAL_MIN`); the calendar list uses the same cadence.

## Files

- `src/server/ics.server.ts` — dependency-free ICS parser + RRULE expansion
  (pure functions).
- `src/server/calendar-sync.server.ts` — fetch/parse/upsert/scheduler.
- `src/routes/api/calendar.ts` + `calendar.handler.ts` — GET/POST route-level
  handlers (Stage-3 lesson: Nitro file-based API scanning doesn't work here).
- `src/components/calendar-screen.tsx` — real-data UI; `event-editor.tsx` new;
  `event-detail.tsx` gained edit/delete affordances for local events.
- `src/server/ai.server.ts` — 2 new tools; `src/routes/api/chat.handler.ts`
  + `src/components/chat-screen.tsx` — create_event confirmation card.
- `src/db/schema.ts` — `calendar_subscriptions` table; `calendar_events`
  gained `ics_uid`, `subscription_id`, `start_utc`, `recurrence_of`.
- Migration: `drizzle/0001_married_iron_monger.sql` (applied to prod).

## RRULE support scope

- `FREQ=DAILY/WEEKLY/MONTHLY`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (weekly).
- Expansion window: now−7 d → now+90 d, bounded at 400 occurrences.
- `RECURRENCE-ID` overrides: best-effort (match by UID + start within 30 min).
- `VALARM` ignored; TZID handled for `Asia/Kolkata` (and UTC); unknown TZIDs
  treated as UTC; floating times assumed IST (the app's display timezone).
- Not supported: BYMONTHDAY/BYSETPOS, yearly freq, exdates (beyond overrides).

## Sync cadence

- Timer tick: every 15 min, only subscriptions with
  `last_fetched_ts` older than 15 min are fetched.
- Failures back off implicitly (they set last_fetched_ts too, retry next tick).

## Deferred / known limits

- Two-way CalDAV (write back to Google/Apple) — deliberately deferred; the UI
  states the subscription is read-only.
- RRULE scope above (no exdates/bymonthday/yearly).
- The scheduler runs in the app process; on restart, first `/api/calendar`
  GET or the next tick re-syncs due subscriptions.

## Owner actions

- None required (no new env vars; ICS URLs are per-user in-app).
- To test: Calendar → 🔗 icon → paste an ICS/webcal URL.