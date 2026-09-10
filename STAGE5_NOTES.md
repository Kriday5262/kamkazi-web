# Stage 5 — Reminders (Web Push + Email)

## Architecture

- **Web push (VAPID)**: `src/server/push.server.ts` — web-push npm package, keys from `.env`
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEBPUSH_SUBJECT`). Generate/regenerate with
  `npm run push:generate` (scripts/generate-vapid.mjs); paste output into `.env` manually.
  Service worker: `public/sw.js` (push → showNotification, notificationclick → focus/open app at data.url).
  Registered silently by `src/components/push-service-worker.tsx` in `__root.tsx`.
- **Subscriptions**: `push_subscriptions` table (id, user_id, endpoint UNIQUE, p256dh, auth,
  user_agent, created_at_ts, last_used_ts). One row per device. Endpoints answering 404/410 are
  pruned on send (iOS expires registrations after ~7 idle days).
- **Reminder engine**: `src/server/reminders.server.ts` — in-memory 60s tick (same pattern as the
  calendar-sync scheduler; started idempotently from `/api/push` GET). Each tick scans:
  - tasks with `due_date == today(IST Asia/Kolkata)` and a `due_time` inside the
    `notifyMinutesBefore` window (default 10 min, also catches up to `lead` min overdue),
  - `calendar_events` with `start_utc` inside the same window,
  - the daily digest at `digestTime` IST (default 08:00, off by default).
- **Idempotency**: `reminder_state` table keyed `"task:<id>:<date>"`, `"event:<id>:<start_utc>"`,
  `"digest:<uid>:<date>"` — inserted before delivery, so restarts never double-send.
- **Channels per user**: web push → all subscribed devices; email if `emailNotifications` on.
- **Email**: `src/server/email.server.ts` — SendGrid REST API via fetch.
  QUIRK: on this SendGrid account the request body must use `content:[{type:'text/plain', value:'…'}]` —
  the documented `content` field returns HTTP 400 "content value must be a string". The code sends
  `value` and documents why; do not "fix" it. 403 responses are surfaced as
  "Sender identity not verified — verify <MAIL_FROM> in SendGrid".
- **Settings**: Settings → Notifications (`NotificationsCard` in `src/routes/settings.tsx`):
  enable/disable push per device (permission requested on tap, iOS-compliant), send test push /
  test email, remind-me-before select (5/10/15/30), task + event toggles, daily digest on/off +
  time, email on/off + recipient. Stored in `user_settings.settings.notificationSettings`.
- **AI**: chat system prompt now tells the model that tasks with a due date+time trigger a
  reminder a few minutes before, and to create such tasks for "remind me" requests.

## API

- `GET  /api/push` — VAPID public key, config status, notification settings, subscribed devices.
- `POST /api/push?action=subscribe|unsubscribe|test|test-email|settings|tick|tick-check`
- `GET  /api/push/vapid-key` — public key only.

## PWA / iOS / macOS

- `public/manifest.webmanifest` (name, start_url, display standalone, 192/512 icons
  any+maskable — generated PNGs in `public/`), linked in `__root.tsx` head, plus
  apple-touch-icon and apple-mobile-web-app meta tags (home-screen web-app capable).
- iOS: push only works in the installed home-screen app. Settings shows a hint when
  `navigator.standalone` is false on iOS Safari. macOS "Add to Dock" uses the same manifest;
  notifications appear in the macOS Notification Centre and the Dock icon badges bounce on click.
- Service worker is served at `/sw.js` (public dir). Registration happens on any page load;
  `Notification.requestPermission()` only fires from the Settings button tap.

## Env (see DEPLOY.md)

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEBPUSH_SUBJECT`, `SENDGRID_API_KEY`, `MAIL_FROM`.

## Testing

Real-device: open https://app.kamkazi.com on iPhone home-screen app or Mac Dock app →
Settings → Notifications → "Enable notifications" → "Send test push".

Server-side verification used during this stage:
1. `curl -k https://127.0.0.1:8443/sw.js` (or via the tunnel) → JS with `push` handler,
   correct `application/javascript` content-type.
2. Subscription round-trip: POST a fake subscription to `/api/push?action=subscribe`
   (endpoint `https://fcm.googleapis.com/fcm/send/fake…`) → row appears in
   `push_subscriptions`; POST `action=test` → attempt fails, and a 410-style gone
   endpoint is pruned automatically (row deleted).
3. Test email: POST `/api/push?action=test-email` → SendGrid 202 (check the mailbox).
4. Reminder tick: create a task due in ~2 minutes → POST `/api/push?action=tick`
   → `reminder_state` row created, push attempt logged; running `tick-check` again
   shows 0 new reminders (idempotent).
