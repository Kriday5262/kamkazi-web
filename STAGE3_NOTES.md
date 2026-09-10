# Stage 3 — Real AI (chat, briefing, weather)

Committed as 89dad1b (2026-09-07). Prod stack rebuilt and verified end-to-end.

## Architecture
- **src/server/ai.server.ts** — provider resolution (hermes → openai → ollama), SSE streaming chat-completions client (plain fetch), tool definitions, uid-scoped `executeTool`, Open-Meteo fetcher.
- **API routes mounted via TanStack Start route-level `server.handlers`** (`createFileRoute(...).server.handlers.GET/POST`) with logic in sibling `*.handler.ts` files.
  - ⚠️ Key lesson: Nitro's file-based API scanning does NOT pick up plain `export const GET` functions in this project (`@lovable.dev/vite-tanstack-config` build) — the SSR catch-all served HTML. Route-level `server.handlers` run inside the TanStack pipeline and work in prod. (Dev worked either way — verify in prod build!)
- **Endpoints**: `GET /api/briefing` (1h per-user in-memory cache, static DB fallback), `GET /api/weather` (Open-Meteo, Dehradun 30.32/78.03), `POST /api/chat` (SSE: `delta`/`tool`/`done`/`error` events; conversations + messages persisted), `POST /api/tool-confirm` (executes user-confirmed write-tools).
- **Tools**: create_task, complete_task, create_note (write → confirmation card in UI, never auto-executed), list_tasks_today, get_weather (read-only, silent).
- **UI**: PendingActionCard in chat (Confirm/Cancel), briefing + weather live on Today screen, provider/model/API-key switchable in Settings. Design untouched.

## Verified in prod (https://localhost:8443, Playwright)
- Briefing: real AI text referencing actual tasks + live weather; cached second call.
- Weather: Open-Meteo live (23°C drizzle in Dehradun at test time).
- Chat stream: SSE deltas + `tool` event with `needsConfirm: true` for "Create a task to buy milk tomorrow".
- tool-confirm: 200 `{"ok":true,"summary":"Task created: “Buy milk” (due 2026-09-07)"}`; row present in Postgres.
- Chat screen UI: message sent, streamed reply rendered.
- tsc clean, lint 0 errors, NITRO_PRESET=node_server build passes, image rebuilt, stack healthy.

## Gotchas
- `host.docker.internal` does NOT resolve in the app container → Hermes endpoint must be `http://192.168.29.188:11436/v1` (LAN IP).
- The source of briefing.handler.ts was accidentally truncated mid-edit and rewritten from the schema/ai.server exports — behavior matches the original spec (1h cache, static fallback).
- Playwright needs `--ignore-certificate-errors` / `ignore_https_errors=True` for the self-signed Caddy cert.

## Env (see .env.example / DEPLOY.md)
HERMES_BASE_URL, OPENAI_API_KEY, OLLAMA_BASE_URL (optional).

## Deferred
- Reminders (Stage 5), calendar AI integration, multi-user auth.
- Briefing cache is in-memory (resets on container restart) — DB persistence deferred.