# Stage 2 — Production Deployment

Built and verified 2026-09-06. Production stack runs at **https://192.168.29.188:8443**.

## What was built
- **Dockerfile** — multi-stage (node:22-alpine build → alpine runtime), non-root `kamkazi` user, HEALTHCHECK on `GET /login`.
  - Gotcha: `@lovable.dev/vite-tanstack-config` silently builds a `cloudflare-module` preset unless `NITRO_PRESET=node_server` is set (Dockerfile does `RUN NITRO_PRESET=node_server npm run build`).
  - Gotcha: this Nitro build ignores `PORT`/`HOST` — only `NITRO_PORT`/`NITRO_HOST` bind (set to 8086/0.0.0.0).
  - `.dockerignore` prevents a stale `.output` from polluting the image.
- **docker-compose.prod.yml** — app (internal 8086) + postgres:16 + caddy.
  - Postgres **reuses the Stage-1 external volume `kamkazi_kamkazi_pgdata`** (no data duplication).
  - Postgres reachable only on the compose network + `127.0.0.1:5434` (host-side migrate/seed/backups). App port not host-exposed.
- **Caddy TLS** — internal self-signed certs on 8443→443. Config needs explicit subjects (`localhost`, `192.168.29.188`, `kamkazi.local`) + `default_sni localhost`; `auto_https off` with a catch-all `https://:443` label silently breaks handshakes ("no certificate available").
- **Backups** — `scripts/backup-db.sh` (pg_dump gzip → `backups/YYYY-MM-DD/`, prunes >14 days) and `scripts/restore-db.sh`. Backup verified working.
- **Auth prod fix** — nested `createServerFn` delegation fails with "Server function info not found" in prod builds; `loginHandler`/`logoutHandler` in `src/lib/auth-handlers.server.ts` converted to plain async functions.
- `.env` (local, gitignored) with generated `SESSION_SECRET`.

## Verified
- `docker compose -f docker-compose.prod.yml up -d` — all 3 services healthy.
- `curl -k https://localhost:8443/login` → 200; `/` unauthenticated → 307 → `/login`.
- Playwright: POST login → `kamkazi_session` cookie → authenticated `/` renders "Good evening, Shantanu", briefing, Tasks (14), Dehradun weather.
- Migrations + idempotent seed ran against prod Postgres via 127.0.0.1:5434.
- tsc --noEmit clean; npm run lint 0 errors.

## Run commands
```bash
cd /tmp/kamkazi
docker compose -f docker-compose.dev.yml stop db        # prod db owns the shared volume
docker compose -f docker-compose.prod.yml up -d --build
DATABASE_URL=postgres://kamkazi:kamkazi@127.0.0.1:5434/kamkazi npm run db:migrate   # first run only
DATABASE_URL=... npm run db:seed   # first run only
bash scripts/backup-db.sh
bash scripts/restore-db.sh backups/<date>/<file>.sql.gz
```

## Owner action items
- Change `KAMKAZI_PASSWORD` / `SESSION_SECRET` in `.env` for any non-LAN exposure.
- Cloudflare fronting (both documented in DEPLOY.md): A record proxying 8443 with SSL mode "Full" (self-signed origin), or a cloudflared tunnel.
- Dev compose `db` is stopped by design (single writer on shared volume).

## Ports
- 8443 → Caddy HTTPS (only new public binding)
- 127.0.0.1:5434 → Postgres (loopback only)
- 8086 internal app port; dev Vite still on 8085