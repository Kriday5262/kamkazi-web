# Handoff prompt — Kamkazi (take the prototype to a real, self-hosted app)

Copy everything below the line into the other AI agent as its brief.

---

## Role

You are taking over an existing, working front-end prototype called **Kamkazi** and turning it into a real application that runs on my own local server (Linux, self-hosted, behind my home/office network). I am the product owner. Do not redesign the product — the UI and UX are approved. Your job is development, backend, persistence, and deployment.

## What Kamkazi is

A calm, AI-first daily workspace that brings schedule, tasks, notes and an assistant into one product. Screens already built and approved:

- **Today** — greeting, weather, AI daily briefing, overview row, one chronological agenda mixing meetings and tasks with a live current-time marker, inline task completion, quick capture, read-only event detail.
- **Tasks** — lists rail (Inbox, Today, Upcoming, Work, Personal, Shopping, custom lists), task rows, detail panel with description, list, due date/time, reminder, repeat, priority, tags, subtasks, attachments, delete.
- **Notes** — notebooks, searchable list with pinned section, Markdown editor with title, notebook, tags, pin.
- **Calendar** — compact month grid (prev/next/Today) with planning dots, plus agenda for the selected date; month left / agenda right on wide screens.
- **AI Chat** — conversation history (pin, rename, delete), Markdown + code rendering, slash commands, action confirmation cards.
- **Command palette** — Cmd/Ctrl+K across tasks, notes, events, chats.
- **Settings** — general, AI, tasks, notes, calendar, weather, notifications, account.

Responsive: desktop (sidebar + content + detail panel), tablet (collapsible sidebars, sheets), phone (bottom tab bar, sheets, composer above the tab bar). Light and dark themes. Time-of-day hero illustration (morning / afternoon / evening).

## Current state of the code

- **Stack:** TanStack Start v1 (React 19, file-based routing, SSR) on Vite, TypeScript, Tailwind CSS v4, shadcn/ui + Radix primitives, lucide-react icons, sonner toasts, TanStack Query available.
- **Routes:** `src/routes/` — `index.tsx` (Today), `tasks.index.tsx`, `tasks.$listId.tsx`, `notes.index.tsx`, `notes.$noteId.tsx`, `calendar.tsx`, `chat.index.tsx`, `chat.$chatId.tsx`, `settings.tsx`, `__root.tsx` (shell).
- **Screens/components:** `src/components/` (`app-shell`, `today-screen`, `tasks-screen`, `task-detail`, `notes-screen`, `note-editor`, `calendar-screen`, `event-detail`, `chat-screen`, `command-palette`, `markdown`, `primitives`, `ui/*`).
- **State:** `src/lib/store.tsx` — a single React context holding tasks, lists, notes, notebooks, events, conversations, theme, settings, and all mutation functions. **Everything is in memory and resets on reload.**
- **Sample data:** `src/data/seed.ts` — typed `Task`, `TaskList`, `Note`, `Conversation`, `CalendarEvent`, `DatedEvent`, plus deterministic date helpers.
- **Design tokens:** `src/styles.css` — pastel palette, semantic tokens only. Components must never hardcode colours.
- **AI chat is fake:** `draftReply()` in `src/lib/store.tsx` returns scripted responses.
- **Weather is fake:** static sample values on Today.
- Scripts: `npm run dev` (port 8080), `npm run build`, `npm run preview`, `npm run lint`, `npm run format`.

## What I want you to build

### 1. Persistence (highest priority)

- Add a **PostgreSQL** database (self-hosted, in Docker) with a schema covering: users, task lists, tasks (with subtasks, tags, priority, due date/time, reminder, repeat, attachments), notebooks, notes (title, body Markdown, tags, pinned, timestamps), calendar events (dated, all-day support, location, calendar/colour, attendees), chat conversations and messages, and user settings.
- Use a typed migration-based tool (Drizzle or Prisma — pick one and justify briefly).
- Replace the in-memory store with real reads/writes. Keep `useStore()`'s public API as stable as you can so screens change as little as possible; move data fetching to TanStack Query + TanStack Start server functions (`createServerFn`), with optimistic updates for completing tasks and editing notes so the UI stays instant.
- Seed the database once with the existing `src/data/seed.ts` content so first run looks like the prototype.

### 2. Accounts

- Email + password authentication, sessions in httpOnly cookies, password hashing (argon2 or bcrypt).
- Single-user by default but multi-user capable: every row scoped to a user id, enforced server-side. Never trust a client-supplied user id.
- Protected routes redirect to a sign-in page that matches the existing design language.

### 3. Real AI assistant

- Wire AI Chat to a real model. Support **both** a hosted provider (OpenAI-compatible API, key from env) and a **local model via Ollama**, selectable in Settings — I self-host, so local must work.
- Stream responses token by token into the existing chat UI.
- Give the assistant read access to my tasks, notes and events so "plan my day", "prioritise", "what's free this afternoon" and "search my notes" actually work, plus tool/function calls to create tasks and notes — these already have confirmation cards in the UI, keep them.
- Keep the daily briefing on Today generated from real data, cached per day.
- All AI calls server-side only. No keys in the browser. No client-side timeouts on generations.

### 4. Real calendar and weather

- Calendar: import/subscribe via ICS URL and two-way sync with CalDAV if feasible; if not, ICS read-only plus locally created events, and say so.
- Weather: a free API (Open-Meteo needs no key) using the location from Settings, cached server-side.

### 5. Reminders and notifications

- Due-date and event reminders. Web push where supported, plus optional email via SMTP I configure.

### 6. Deployment on my local server

- Provide a **docker-compose** setup: app container, Postgres, and a reverse proxy (Caddy or nginx) with HTTPS via a local certificate or Let's Encrypt DNS challenge.
- Multi-stage Dockerfile, production build, non-root user, healthchecks, restart policies.
- Named volumes for database and uploaded attachments; a documented **backup and restore** script (pg_dump + files, scheduled).
- A single `.env.example` listing every variable with comments.
- A `DEPLOY.md` with: prerequisites, first-run steps, how to create the first account, how to upgrade, how to restore a backup, and how to read logs.

### 7. Quality bar

- TypeScript strict, no `any` in new code, `npm run lint` clean, production build passes.
- Vitest unit tests for data logic (recurrence, agenda ordering, date handling) and Playwright end-to-end tests for: sign in, create/complete a task, write a note, navigate months, open event details, send a chat message.
- Keep server rendering working — no hydration mismatches. All date maths in a single place; the prototype uses UTC-based construction deliberately, keep that discipline and store timestamps as UTC, render in the user's timezone.
- Accessibility must not regress: keyboard navigation, visible focus, non-colour status cues.

## Hard constraints

- **Do not change the visual design, layout, spacing, palette or copy** unless a change is required for a feature I asked for — then flag it first.
- Do not swap the router or framework. TanStack Start stays.
- Do not introduce colour utilities in components; extend `src/styles.css` tokens instead.
- No third-party SaaS dependency required for the app to run. It must work fully on my own hardware with local AI, though hosted AI stays optional.
- Keep bundle size sensible; no heavy component library additions.

## How to work

1. Start by reading the repo and writing me a short plan: data model, migration strategy, order of work, and anything you think I've got wrong.
2. Ship in this order: database + persistence → auth → deployment (so I can run it early) → real AI → calendar/weather → reminders → tests and polish.
3. Work in small pull requests with clear descriptions and screenshots of anything visual.
4. Ask me before making product decisions; make routine technical calls yourself.
5. Tell me plainly at the end of each stage what works, what doesn't yet, and what I need to configure.

## My environment

- Local server: Linux, Docker and docker-compose available. (Tell me if you need more than 8 GB RAM for local AI.)
- Access from laptop and phone on my own network; possibly a tunnel for outside access later.
- I'll supply: domain/hostname, SMTP details, any API keys.

---
