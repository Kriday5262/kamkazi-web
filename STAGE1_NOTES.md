# Kamkazi — Stage 1 Notes (Persistence + Auth)

## What was built

- **PostgreSQL via Docker** — `docker-compose.dev.yml` runs `postgres:16` on host
  port **5433** (db `kamkazi`, user `kamkazi`, password `kamkazi`), data in the
  named volume `kamkazi_pgdata`.
- **Drizzle ORM** (`drizzle-orm` + `pg` driver, `drizzle-kit` for migrations).
  Schema in `src/db/schema.ts`: `users`, `task_lists`, `tasks`, `notebooks`,
  `notes`, `calendar_events`, `conversations`, `chat_messages`, `user_settings`.
  - All timestamps are `timestamptz` (UTC). The prototype's date strings
    ("YYYY-MM-DD") are kept as `text` where the UI treats them as calendar days.
  - **Every table is scoped by `user_id`** even though auth is single-user —
    multi-user later needs no business-table migration.
  - **Tags are `text[]`** (chosen over a join table): tags are free-form labels
    with no per-tag metadata; a join table adds queries without adding
    capability. Revisit if tag-level features land.
- **Server layer** — TanStack Start `createServerFn` RPCs in
  `src/lib/auth-data.ts` (auth + data) with a request middleware
  (`src/request-context.ts`) that exposes the raw request for cookie parsing.
  Client store (`src/lib/store.tsx`) keeps the exact same public `useStore()`
  API; screens are unchanged. All mutations are **optimistic with rollback on
  server failure**; initial data is loaded server-side in the root
  `beforeLoad` (SSR/hydration agree).
- **Seed** — `src/db/seed.ts` (via `npm run db:seed`, tsx). Idempotent: skips if
  the user's task lists already exist. Seeds tasks, lists, notebooks, notes,
  calendar events, chat conversations and default settings.
- **Auth (Stage 1)** — hardcoded single user `Shantanu` /
  `SmartHome@2012` (case-sensitive, overridable via `KAMKAZI_USERNAME` /
  `KAMKAZI_PASSWORD` env). Verified server-side in the `login` server function.
  On success the server returns an **httpOnly HMAC-SHA256 signed cookie**
  (`kamkazi_session`), 30-day expiry, secret from `SESSION_SECRET`. The user id
  is always resolved server-side from the cookie — never from client input.
- **Route guard** — `beforeLoad` in `src/routes/__root.tsx` redirects to
  `/login` when no valid session; `/login` itself redirects authenticated
  users back to `/`. Logout button lives in Settings → account card.
- **`.env.example`** with `DATABASE_URL` and `SESSION_SECRET` (copy to `.env`).
- **STAGE 3/4 settings locked in now (product-owner decisions):**
  - `user_settings.settings` includes `aiProvider: "hermes" | "openai" |
    "ollama"`, seeded to `"hermes"`. Stage 3 will point the assistant at the
    **local Hermes agent API (OpenAI-compatible) on this SmartHub server** —
    no schema change will be needed.
  - Weather location is **locked to Dehradun, India** — seeded as
    `weatherLocation: "Dehradun"`, `weatherLat: 30.3165`, `weatherLon:
    78.0322` for Stage 4 (Open-Meteo).

## How to run

```bash
cd /tmp/kamkazi
cp .env.example .env            # adjust DATABASE_URL / SESSION_SECRET
docker compose -f docker-compose.dev.yml up -d
npm install
npm run db:generate             # only when schema changed
npm run db:migrate
npm run db:seed
npm run dev -- --port 8085      # port 8080 is taken by another service on this box
```

Login at `/login` with `Shantanu` / `SmartHome@2012`.

## Why Drizzle over Prisma

- **Lighter dev loop**: drizzle-kit generates plain SQL migrations from the
  schema with no shadow database or engine binary; Prisma adds a native query
  engine and a slower generate step to every install.
- **Closer to the prototype's shapes**: the app stores dates as strings and
  subtasks as JSON — Drizzle lets us model exactly that (text/jsonb columns)
  without fighting a generated client.
- **Server-function friendliness**: Drizzle's query builder works directly
  inside TanStack Start server functions with no codegen/artifact step, and
  its bundle footprint in the server build is far smaller.
- Migration story is identical in safety (generated SQL, versioned in
  `drizzle/`); Prisma's main win (mature studio/tooling) isn't needed at this
  stage.

## Verification performed

- `docker compose -f docker-compose.dev.yml up -d` → healthy.
- `npm run db:generate`, `db:migrate`, `db:seed` → applied, idempotent.
- `npm run build` ✅, `npm run lint` ✅ (0 errors), `tsc --noEmit` clean.
- Unauthenticated `GET /` → redirect to `/login`; `/login` renders (200).
- Login server function: wrong password rejected; correct credentials return
  the signed httpOnly session cookie.
- Authenticated `GET /` renders Today with seeded data.
- Created a task through `saveTask` → present in Postgres; **restarted the dev
  server → task still present in the rendered app** (persistence proof).
- Test task removed afterwards; Postgres left running.

## Intentionally deferred (later stages)

- Real AI backend wiring (Stage 3): only the `aiProvider` setting exists;
  "hermes (local)" is the seeded default. No HTTP calls are made yet.
- Weather integration (Stage 4): location + coordinates seeded; no Open-Meteo
  calls.
- Multi-user registration/password-reset; password is a placeholder in
  `users.password` (`"(stage1)"`).
- File upload for task attachments (attachments are name/size metadata only).
- Reminder/push notifications (reminder text is stored, nothing fires).

## Product-owner configuration

- Set a real `SESSION_SECRET` (`openssl rand -hex 32`) in `.env` — the default
  is dev-only.
- Optionally override `KAMKAZI_USERNAME` / `KAMKAZI_PASSWORD` in `.env`.
- The dev server must use a port other than **8080** (occupied by another
  service on this machine); use `--port 8085` or similar.
- `docker compose -f docker-compose.dev.yml up -d` leaves Postgres on port
  **5433**, not 5432 — keep that in mind for external tools.