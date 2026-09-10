# AI-First Productivity App — Full UI Prototype

A calm, premium daily workspace bringing today's plan, tasks, notes and an AI assistant into one product. This first version is a fully navigable prototype: every screen is designed and clickable, filled with realistic sample data (meetings, design work, errands, notes, AI conversations). Nothing is saved between visits yet; logins, saved data and a real AI can come later.

## Look and feel

Cool graphite theme, light and dark from the start:
- Light: soft cool off-white surfaces (#F7F8FA), layered panels (#E6E9EE), deep ink text (#16181D)
- Dark: layered charcoal surfaces, not inverted colors
- Muted blue accent (#3B6EA5) used sparingly for selection, priority and AI moments
- Generous whitespace, strong type hierarchy, hairline separators, restrained radii, subtle motion
- No SaaS-dashboard cards-in-cards, no purple AI glow, no heavy shadows

## Screens

1. **Today** — greeting with date and compact weather; an AI daily briefing with "Plan my day / Ask about today / Prioritize"; a unified chronological agenda mixing events and tasks with a live current-time line, overdue, all-day, untimed and completed handling; inline task completion; quick capture for task, note, ask AI.
2. **Tasks** — list rail (Inbox, Today, Upcoming, Work, Personal, Shopping, custom lists with icon, color, counts), clean task rows showing only relevant metadata, and a detail panel with description, list, due date/time, reminder, repeat, priority, tags, subtasks, attachments, delete.
3. **Notes** — notebooks (Personal, Work, Projects, Ideas, Research), a notes list with preview, edited time, pinned section, search and sort, and a distraction-free full editor with Markdown shortcuts, a contextual formatting bar, title, notebook, tags, pin and share.
4. **AI Chat** — conversation history sidebar (New chat, search, Recent / Previous 7 days / Older) with rename, pin, delete; a polished conversation view with Markdown, code, tables, copy and retry; composer with attachments, voice placeholder and slash commands; action confirmation cards like "Task created".
5. **Command palette** — ⌘K anywhere, searching tasks, notes, events and chats plus commands to create and navigate.
6. **Settings** — General, AI, Tasks, Notes, Calendar, Weather, Notifications, Integrations, Account, grouped with progressive disclosure.
7. **Empty, loading and error states** for every list and panel.

## Responsiveness

- Desktop: sidebar → content → contextual detail panel
- iPad: collapsible sidebar, split views, sheets, large touch targets, multi-column landscape, collapsed portrait
- iPhone: bottom tab bar, navigation stacks, sheets for detail, swipe actions, reachable quick capture — not a shrunken desktop

## Build order

1. Design tokens, typography and spacing scale, light/dark themes, app shell with responsive navigation
2. Shared primitives: nav item, task row and checkbox, event row, agenda timeline, note row, chat message, composer, search field, sheet, popover, menu, empty and skeleton states, toast
3. Today, then Tasks (Inbox/Today/Upcoming + detail), then Notes (list + editor), then AI Chat, then command palette, then Settings
4. Accessibility and interaction polish pass: keyboard navigation, visible focus, non-color status cues, motion on complete/open/switch

## Technical notes

- TanStack Start routes: `/` (Today), `/tasks`, `/tasks/$listId`, `/notes`, `/notes/$noteId`, `/chat`, `/chat/$chatId`, `/settings` with section subroutes
- Sample data in typed modules under `src/data`, held in React state per session so interactions (completing, editing, creating) feel real within a visit
- Tailwind v4 semantic tokens in `src/styles.css`; no hardcoded color utilities
- shadcn primitives where they fit, restyled to the product's own language
- Markdown rendering for notes and chat; per-route page titles and descriptions
