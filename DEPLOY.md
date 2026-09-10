# Kamkazi — Production Deployment (SmartHub)

Kamkazi runs as an always-on Docker stack: **app (Nitro node-server) + PostgreSQL 16 + Caddy (HTTPS)**.

## Ports

| Port | Service | Binding |
|------|---------|---------|
| 8443 | Caddy (HTTPS, self-signed internal cert) | 0.0.0.0 |
| 8086 | App (Nitro node-server) | container network only |
| 5434 | PostgreSQL (for host-side migrate/seed/backup) | 127.0.0.1 only |

The app's port 8086 is **not** published to the host — Caddy proxies to it over the compose network. Postgres is only reachable from the compose network plus a loopback-only mapping for migrations/backups. **Never expose Postgres to the LAN.**

## TLS choice

Caddy serves **HTTPS with an internal (self-signed) certificate** on :8443. Why: the app sets `Secure` session cookies when `NODE_ENV=production`, so plain HTTP would break login; a self-signed cert is the simplest robust option for a LAN box that will later sit behind Cloudflare (which terminates TLS publicly). Browsers show a one-time "not private" warning — accept it on the LAN, or front with Cloudflare for a trusted chain.

## First deployment

```bash
cd /tmp/kamkazi

# 1. Stop the dev compose db so only one Postgres writes to the shared volume
#    (prod reuses the Stage-1 volume kamkazi_kamkazi_pgdata — same data, no duplication).
docker compose -f docker-compose.dev.yml stop db

# 2. Configure secrets
cp .env.production.example .env
#   Edit .env: set SESSION_SECRET=$(openssl rand -hex 32) and change KAMKAZI_PASSWORD.

# 3. Build & start
docker compose -f docker-compose.prod.yml up -d --build

# 4. Migrate + seed (from the host via the loopback mapping; needs node locally)
DATABASE_URL=postgres://kamkazi:kamkazi@127.0.0.1:5434/kamkazi npm run db:migrate
DATABASE_URL=postgres://kamkazi:kamkazi@127.0.0.1:5434/kamkazi npm run db:seed

# 5. Verify
curl -k https://localhost:8443/login          # 200
curl -sk https://localhost:8443/ -o /dev/null -w '%{http_code}\n'   # 307 -> /login
```

Open **https://192.168.29.188:8443** on the LAN (accept the self-signed warning).

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `SESSION_SECRET` | yes (compose fails without it) | HMAC key signing the `kamkazi_session` cookie. Generate: `openssl rand -hex 32` |
| `KAMKAZI_USERNAME` | no (default `Shantanu`) | login username |
| `KAMKAZI_PASSWORD` | no (default `SmartHome@2012` — **change it**) | login password |
| `DATABASE_URL` | host-side scripts only (`postgres://kamkazi:***@127.0.0.1:5434/kamkazi`) | migrations, seed, backups from the host |
| `VAPID_PUBLIC_KEY` | yes for web push (Stage 5) | VAPID public key. Generate: `npm run push:generate` |
| `VAPID_PRIVATE_KEY` | yes for web push (Stage 5) | VAPID private key (pair with the public one) |
| `WEBPUSH_SUBJECT` | no (default `mailto:noreply@kamkazi.com`) | contact URI sent to push services, e.g. `mailto:shantanu@smarthomeskc.me` |
| `SENDGRID_API_KEY` | no — enables the email channel (Stage 5) | SendGrid API key with Mail Send permission |
| `MAIL_FROM` | yes when SENDGRID_API_KEY is set | From address; must be a verified sender (or on a verified domain) in SendGrid, else sends fail with 403 "sender identity not verified" |

Inside the stack the app always uses `postgres://kamkazi:kamkazi@db:5432/kamkazi`.

## Backup / restore

```bash
scripts/backup-db.sh        # gzipped pg_dump -> backups/YYYY-MM-DD/, keeps last 14 days
scripts/restore-db.sh backups/2026-09-06/kamkazi-20260906-031000.sql.gz   # destructive; asks to confirm
```

Cron suggestion (daily 03:10, host crontab):

```
10 3 * * * /tmp/kamkazi/scripts/backup-db.sh >> /tmp/kamkazi/backups/backup.log 2>&1
```

## Update flow

```bash
cd /tmp/kamkazi
git pull
docker compose -f docker-compose.prod.yml up -d --build
# If drizzle/ changed:
DATABASE_URL=postgres://kamkazi:kamkazi@127.0.0.1:5434/kamkazi npm run db:migrate
```

## Logs / ops

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart app
```

## Cloudflare fronting (not configured — options)

1. **DNS + proxy (port forwarding):** point an A record (e.g. `kamkazi.yourdomain.com`) at your public IP; Cloudflare proxies it (orange cloud) to your router, which forwards WAN 443 → SmartHub 8443. Cloudflare terminates TLS publicly; Caddy's self-signed cert is the origin cert (set Cloudflare SSL mode "Full", not "Full (strict)", or install a Cloudflare Origin Cert in Caddy later).
2. **Cloudflare Tunnel (preferred, no port forwarding):** run `cloudflared` on SmartHub with a tunnel pointing at `https://localhost:8443` (with `noTLSVerify: true` for the self-signed origin) or at the app directly over HTTP via a `http://` service URL if you switch the Caddyfile to plaintext. Nothing needs to be open on the router.

## Healthcheck

The app image has a Docker `HEALTHCHECK` hitting `GET /login` (expects 200) every 30s.
## Stage 3 — AI providers (env vars)

| Variable | Purpose | Default |
|---|---|---|
| `HERMES_BASE_URL` | Primary AI (OpenAI-compatible) | `http://192.168.29.188:11436/v1` |
| `OPENAI_API_KEY` | Fallback when provider = openai (or set per-user in Settings) | — |
| `OLLAMA_BASE_URL` | Fallback when provider = ollama | `http://192.168.29.188:11434/v1` |

Notes:
- From inside the app container use the **host LAN IP** — `host.docker.internal` does not resolve in this container.
- Provider, model and (for OpenAI) API key are switchable per-user in **Settings** in the app.
- Weather is real Open-Meteo data (Dehradun by default, editable in Settings).


## Stage 4.5 (Google Calendar, read-only)

Optional. Preferred setup is in-app: **Settings → Calendar → Google Calendar →
Connect** (stores the OAuth client per-user; refresh tokens are AES-256-GCM
encrypted with a key derived from `SESSION_SECRET`). Server-wide env fallback:

| Variable | Purpose | Default |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client id (fallback if not set in-app) | — |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret (same) | — |

Full user setup guide: [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md). Redirect
URI to register: `https://app.kamkazi.com/api/google/callback`.

## Stage 4 (Calendar)

ICS/webcal calendar subscriptions are configured per-user inside the app
(Calendar → Subscriptions). No env vars are needed. Subscribed feeds are
read-only and auto-refresh every 15 minutes.
