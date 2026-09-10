# Kamkazi

A calm, AI-first daily workspace that brings your schedule, tasks, notes and an assistant together on one screen.

Kamkazi is designed to feel personal and unhurried rather than like a dense SaaS dashboard: soft pastel surfaces, illustrated hero art that shifts with the time of day, and only the information that matters right now.

> Current status: a fully navigable UI prototype with realistic sample data. Nothing is persisted between visits yet.

## Screens

- **Today** — greeting, weather, an AI daily briefing, a quick overview row, and one chronological agenda that mixes meetings and tasks with a live current-time marker. Tasks can be completed inline; events open a read-only detail panel.
- **Tasks** — lists rail (Inbox, Today, Upcoming, Work, Personal, Shopping and custom lists), clean task rows, and a detail panel with description, due date, reminder, repeat, priority, tags, subtasks and attachments.
- **Notes** — notebooks, a searchable notes list with pinned section, and a distraction-free Markdown editor.
- **Calendar** — compact monthly grid with previous/next navigation and planning dots, beside the agenda for the selected day. On wide screens the month sits left, the agenda right.
- **AI Chat** — conversation history with pin/rename/delete, Markdown and code rendering, slash commands, and action confirmation cards.
- **Command palette** — ⌘K / Ctrl+K to search tasks, notes, events and chats, or jump anywhere.
- **Settings** — general, AI, tasks, notes, calendar, weather, notifications and account preferences.

## Design

- Pastel palette with sage primary and lilac accent, defined entirely as semantic design tokens in `src/styles.css` (no hardcoded colours in components).
- Sora for headings, Manrope for body text.
- Light and dark themes.
- Time-of-day hero illustrations: morning, afternoon and evening.

## Responsive by design

- **Desktop** — sidebar, content, and a contextual detail panel.
- **iPad** — collapsible sidebars, split views and larger touch targets.
- **iPhone** — bottom tab bar, sheets for detail, and a composer that sits above the navigation bar.

## Tech stack

- TanStack Start (React 19, file-based routing, SSR)
- Vite 7
- TypeScript
- Tailwind CSS v4 with semantic theme tokens
- shadcn/ui primitives, restyled to the product's own language

## Project structure

```
src/
  routes/       file-based routes (/, /tasks, /notes, /calendar, /chat, /settings)
  components/   screens and shared UI primitives
  data/seed.ts  typed sample data (tasks, notes, events, conversations)
  lib/store.tsx session-scoped app state
  styles.css    design tokens, themes and utilities
```

## Running locally

Requires Node.js and npm.

```sh
git clone <this-repository-url>
cd kamkazi
npm install
npm run dev
```

The app runs at `http://localhost:8080`.

## Roadmap

- Accounts and persistent storage
- A real AI assistant wired to your tasks, notes and calendar
- Calendar sync and live weather
- Reminders and notifications

## Built with

Built with [Lovable](https://lovable.dev). Changes made in Lovable sync to this repository, and pushes here sync back.
