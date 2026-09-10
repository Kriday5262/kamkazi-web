# Stage 5.6 — Calendar display names + per-calendar colours

## What changed

- **Registry table** (`calendar_sources`, migration `0004_calendar_sources.sql`): one row per
  (user, source_type 'google'|'ics', account_id, calendar_id) with `display_name`, `colour`
  (blue/green/amber/purple/rose/cyan — the app's accent-token palette), and a `custom_name`
  flag. Chosen over a `calendar_events` column: one registry serves both the read-time label
  resolution AND the per-calendar settings UI, and renames apply to all events instantly.
- **Google sync** (`src/server/google-sync.server.ts`): before syncing events, fetches the
  calendarList and upserts registry rows with the summary (`ensureSource` +
  `refreshSourceName`, which never overwrites `custom_name = true`). ICS
  subscribe/uploadIcs create rows from the subscription name; unsubscribe/disconnect delete them.
- **Label resolution**: `GET /api/calendar` and `loadAll` (Today agenda) join events → registry
  (google: `calendar` column holds the calendarId; ics: key = subscription id) and emit the
  friendly display name; falls back to the stored value when no registry row exists yet.
- **API**: `POST /api/calendar` actions `renameSource` (sets `custom_name`) and
  `setSourceColour` (validates against the palette); GET returns a `sources` array.
- **UI**: Calendar screen gets a "Calendars · name & colour" panel (editable name input +
  Rename, 6 colour swatches, preview dot) under Subscriptions; Settings → Google account cards
  get the same editor ("Calendar names & colours"). Event card colour bars use the calendar's
  registry colour when set, else the existing hash-of-name behaviour.

## Verification (prod, https://app.kamkazi.com)

- Migration applied; backfill via forced sync of all 3 accounts → 8 registry rows with real
  summaries (Happy Family, Reminders, Work, Personal, NStarX Inc., Syneroid,
  Office Holidays 2026, Holidays in India).
- The user's reported events now resolve: "Premium Due: Axis Max Life Insurance" → **Reminders**,
  "Raghav's Piano Class" → **Happy Family**. Zero events with a raw
  `@group.calendar.google.com` label (API + Playwright day view).
- Playwright: rename Happy Family → "Happy Family Test" persisted (API + UI); colour set rose →
  API showed `colour: rose` on the source and its events; both reverted. Event count 190 before
  and after; no rows deleted/duplicated.
- Quality gates: tsc clean, eslint 0 errors, NITRO build ok, docker image rebuilt, app recreated
  and healthy. Committed as ce16134.