export type Priority = "none" | "low" | "medium" | "high";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes?: string | undefined;
  listId: string;
  done: boolean;
  /** ISO date, e.g. "2026-09-06" */
  dueDate?: string | undefined;
  /** "14:30" */
  dueTime?: string | undefined;
  reminder?: string | undefined;
  repeat?: string | undefined;
  priority: Priority;
  tags: string[];
  subtasks: Subtask[];
  /**
   * Real uploaded files: path is server-relative (/attachments/<uid>/<taskId>/<file>),
   * type/sizeBytes optional (older rows keep only id/name/size).
   */
  attachments: {
    id: string;
    name: string;
    size: string;
    type?: string | undefined;
    path?: string | undefined;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start?: string | undefined;
  durationMin?: number | undefined;
  allDay?: boolean | undefined;
  location?: string | undefined;
  calendar: "Work" | "Personal";
}

export interface Note {
  id: string;
  title: string;
  body: string;
  notebookId: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
  /** ISO date (YYYY-MM-DD) the note was created — used for "Date created" sort. */
  createdAt?: string | undefined;
}

export interface Notebook {
  id: string;
  name: string;
  icon: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: { kind: "task" | "note"; title: string; meta: string } | undefined;
  /** Stage 3: write tool awaiting user Confirm/Cancel (JSON-serializable only). */
  pendingAction?:
    { tool: string; args: Record<string, string | number | boolean | null> } | undefined;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  pinned?: boolean | undefined;
  messages: ChatMessage[];
}

/** UTC-based so server render and browser render always agree. */
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export const dayOffset = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return stamp(d);
};

export const TODAY = dayOffset(0);

export const taskLists: TaskList[] = [
  { id: "inbox", name: "Inbox", icon: "inbox", color: "var(--color-muted-foreground)" },
  { id: "work", name: "Work", icon: "briefcase", color: "oklch(0.55 0.1 250)" },
  { id: "personal", name: "Personal", icon: "heart", color: "oklch(0.6 0.11 150)" },
  { id: "shopping", name: "Shopping", icon: "shopping-bag", color: "oklch(0.66 0.12 70)" },
];

const base = {
  reminder: undefined,
  repeat: undefined,
  attachments: [] as Task["attachments"],
  createdAt: dayOffset(-4),
  updatedAt: dayOffset(-1),
};

export const seedTasks: Task[] = [
  {
    ...base,
    id: "t1",
    title: "Finish homepage wireframes",
    notes:
      "Focus on the above-the-fold story: hero, proof, one clear action. Share the Figma link in #design before review.",
    listId: "work",
    done: false,
    dueDate: TODAY,
    dueTime: "11:00",
    reminder: "15 minutes before",
    priority: "high",
    tags: ["design", "acme"],
    subtasks: [
      { id: "s1", title: "Hero layout", done: true },
      { id: "s2", title: "Pricing section", done: false },
      { id: "s3", title: "Mobile pass", done: false },
    ],
    attachments: [{ id: "a1", name: "homepage-v3.fig", size: "2.4 MB" }],
  },
  {
    ...base,
    id: "t2",
    title: "Send proposal to client",
    notes: "Include the revised timeline and the two-phase pricing option.",
    listId: "work",
    done: false,
    dueDate: TODAY,
    dueTime: "15:00",
    priority: "high",
    tags: ["acme"],
    subtasks: [],
  },
  {
    ...base,
    id: "t3",
    title: "Submit expense report",
    listId: "work",
    done: false,
    dueDate: dayOffset(-1),
    priority: "medium",
    tags: ["admin"],
    subtasks: [],
  },
  {
    ...base,
    id: "t4",
    title: "Review Priya's onboarding copy",
    listId: "work",
    done: false,
    dueDate: TODAY,
    priority: "medium",
    tags: [],
    subtasks: [],
  },
  {
    ...base,
    id: "t5",
    title: "Book dentist appointment",
    listId: "personal",
    done: false,
    dueDate: dayOffset(1),
    dueTime: "09:30",
    priority: "low",
    tags: ["health"],
    subtasks: [],
  },
  {
    ...base,
    id: "t6",
    title: "Buy groceries",
    listId: "shopping",
    done: false,
    priority: "none",
    tags: [],
    subtasks: [
      { id: "s4", title: "Coffee beans", done: false },
      { id: "s5", title: "Olive oil", done: false },
      { id: "s6", title: "Spinach", done: true },
    ],
  },
  {
    ...base,
    id: "t7",
    title: "Renew car insurance",
    listId: "personal",
    done: false,
    dueDate: dayOffset(3),
    priority: "medium",
    repeat: "Every year",
    tags: ["money"],
    subtasks: [],
  },
  {
    ...base,
    id: "t8",
    title: "Draft Q4 roadmap outline",
    listId: "work",
    done: false,
    dueDate: dayOffset(2),
    priority: "high",
    tags: ["planning"],
    subtasks: [],
  },
  {
    ...base,
    id: "t9",
    title: "Water the plants",
    listId: "personal",
    done: true,
    dueDate: TODAY,
    priority: "none",
    repeat: "Every 3 days",
    tags: [],
    subtasks: [],
  },
  {
    ...base,
    id: "t10",
    title: "Reply to Anika about the Japan trip dates",
    listId: "personal",
    done: false,
    dueDate: dayOffset(1),
    priority: "low",
    tags: ["travel"],
    subtasks: [],
  },
  {
    ...base,
    id: "t11",
    title: "Order new desk lamp",
    listId: "shopping",
    done: false,
    dueDate: dayOffset(4),
    priority: "none",
    tags: [],
    subtasks: [],
  },
  {
    ...base,
    id: "t12",
    title: "Prepare presentation for Thursday sync",
    listId: "work",
    done: false,
    dueDate: dayOffset(4),
    dueTime: "16:00",
    priority: "medium",
    tags: ["acme"],
    subtasks: [],
  },
  {
    ...base,
    id: "t13",
    title: "Clear inbox to zero",
    listId: "inbox",
    done: false,
    priority: "none",
    tags: [],
    subtasks: [],
  },
  {
    ...base,
    id: "t14",
    title: "Read the accessibility audit summary",
    listId: "inbox",
    done: false,
    priority: "low",
    tags: ["reading"],
    subtasks: [],
  },
];

export const events: CalendarEvent[] = [
  { id: "e0", title: "Anika's birthday", allDay: true, calendar: "Personal" },
  {
    id: "e1",
    title: "Team standup",
    start: "09:00",
    durationMin: 30,
    location: "Google Meet",
    calendar: "Work",
  },
  {
    id: "e2",
    title: "1:1 with Priya",
    start: "10:00",
    durationMin: 30,
    location: "Meet",
    calendar: "Work",
  },
  {
    id: "e3",
    title: "Design review — Acme homepage",
    start: "11:30",
    durationMin: 45,
    location: "Google Meet",
    calendar: "Work",
  },
  {
    id: "e4",
    title: "Lunch with Rahul",
    start: "13:00",
    durationMin: 60,
    location: "Blue Tokai",
    calendar: "Personal",
  },
  { id: "e5", title: "Weekly planning", start: "17:30", durationMin: 30, calendar: "Work" },
];

export const notebooks: Notebook[] = [
  { id: "personal", name: "Personal", icon: "heart" },
  { id: "work", name: "Work", icon: "briefcase" },
  { id: "projects", name: "Projects", icon: "layers" },
  { id: "ideas", name: "Ideas", icon: "lightbulb" },
  { id: "research", name: "Research", icon: "book-open" },
];

export const seedNotes: Note[] = [
  {
    id: "n1",
    title: "Japan trip — spring plan",
    notebookId: "personal",
    tags: ["travel"],
    pinned: true,
    updatedAt: dayOffset(0),
    body: `## Route

Tokyo → Hakone → Kyoto → Osaka, roughly 12 days in early April.

- [x] Lock the flight dates
- [ ] JR Pass — decide 7 or 14 day
- [ ] Book the ryokan in Hakone before it fills up

> Cherry blossom forecast usually lands late March. Book refundable where possible.

### Budget sketch

| Item | Estimate |
| --- | --- |
| Flights | 78,000 |
| Stays | 95,000 |
| Rail | 33,000 |`,
  },
  {
    id: "n2",
    title: "Acme homepage — review notes",
    notebookId: "work",
    tags: ["design", "acme"],
    pinned: true,
    updatedAt: dayOffset(0),
    body: `Feedback from the 11:30 review.

1. Hero copy is still doing two jobs. Pick the outcome, not the feature list.
2. Proof section should sit directly under the hero.
3. Pricing needs a plain-language annual toggle.

**Open question:** do we keep the logo wall or replace it with one strong quote?`,
  },
  {
    id: "n3",
    title: "Q4 roadmap thinking",
    notebookId: "work",
    tags: ["planning"],
    pinned: false,
    updatedAt: dayOffset(-1),
    body: `Three bets for the quarter:

- **Onboarding** — cut time-to-first-value from 9 minutes to under 3
- **Search** — one place to find everything
- **Reliability** — get p95 under 400ms

Everything else is maintenance.`,
  },
  {
    id: "n4",
    title: "Reading list",
    notebookId: "ideas",
    tags: ["reading"],
    pinned: false,
    updatedAt: dayOffset(-2),
    body: `- *The Design of Everyday Things* — reread the chapter on affordances
- Ink & Switch essays on local-first software
- The accessibility audit summary from Tuesday`,
  },
  {
    id: "n5",
    title: "Weeknight recipes that actually work",
    notebookId: "personal",
    tags: ["food"],
    pinned: false,
    updatedAt: dayOffset(-3),
    body: `### Lemon dal
Under 25 minutes. Toor dal, turmeric, a lot of lemon, tadka at the end.

### Sheet-pan paneer
220°C, 18 minutes, toss halfway. Serve with flatbread.`,
  },
  {
    id: "n6",
    title: "Interview questions — product designer",
    notebookId: "work",
    tags: ["hiring"],
    pinned: false,
    updatedAt: dayOffset(-4),
    body: `1. Walk me through a decision you reversed.
2. Show me something you shipped that you'd redo.
3. How do you know a design is finished?`,
  },
  {
    id: "n7",
    title: "Local-first sync — research",
    notebookId: "research",
    tags: ["engineering"],
    pinned: false,
    updatedAt: dayOffset(-6),
    body: `CRDTs give conflict-free merges but cost storage. For a personal task app the write volume is tiny, so the tradeoff is fine.

\`\`\`ts
type Op = { id: string; at: number; field: string; value: unknown };
const merge = (a: Op[], b: Op[]) => [...a, ...b].sort((x, y) => x.at - y.at);
\`\`\``,
  },
  {
    id: "n8",
    title: "Side project — garden log",
    notebookId: "projects",
    tags: [],
    pinned: false,
    updatedAt: dayOffset(-9),
    body: `Track what got planted, when, and what survived. Photos matter more than text.`,
  },
];

export const seedConversations: Conversation[] = [
  {
    id: "c1",
    title: "Plan my Tuesday",
    updatedAt: dayOffset(0),
    pinned: true,
    messages: [
      { id: "m1", role: "user", content: "What do I have today, and what should I prioritise?" },
      {
        id: "m2",
        role: "assistant",
        content: `You have three meetings before lunch and four tasks due.

**Protect these two:**

1. **Design review at 11:30** — the homepage wireframes are due at 11:00, so finish them first.
2. **Proposal to the client** — due 3:00 PM, and it's the only thing today with an external deadline.

Your afternoon after 2:00 PM is open apart from weekly planning at 5:30, which is the best window for focused work.`,
      },
      {
        id: "m3",
        role: "user",
        content: "Create a task to send the proposal to Alex tomorrow morning.",
      },
      {
        id: "m4",
        role: "assistant",
        content: "Done — added to your Work list.",
        action: {
          kind: "task",
          title: "Send proposal to Alex",
          meta: "Tomorrow · 10:00 AM · Work",
        },
      },
    ],
  },
  {
    id: "c2",
    title: "Notes about the Japan trip",
    updatedAt: dayOffset(-1),
    messages: [
      { id: "m5", role: "user", content: "Find my notes about the Japan trip." },
      {
        id: "m6",
        role: "assistant",
        content: `One note matches: **Japan trip — spring plan** in Personal, edited today.

It has the Tokyo → Hakone → Kyoto → Osaka route, a budget sketch, and three open items. The Hakone ryokan booking is the one with a real deadline.`,
      },
    ],
  },
  {
    id: "c3",
    title: "Turn review notes into tasks",
    updatedAt: dayOffset(-2),
    messages: [
      { id: "m7", role: "user", content: "Turn my Acme homepage review notes into tasks." },
      {
        id: "m8",
        role: "assistant",
        content: "I pulled out three actions and put them in Work, all due Friday:",
        action: {
          kind: "task",
          title: "Rewrite hero copy around one outcome",
          meta: "Friday · Work",
        },
      },
    ],
  },
  {
    id: "c4",
    title: "Free time this afternoon",
    updatedAt: dayOffset(-4),
    messages: [
      { id: "m9", role: "user", content: "When do I have free time this afternoon?" },
      {
        id: "m10",
        role: "assistant",
        content:
          "You're clear from **2:00 PM to 5:30 PM**. That's the longest uninterrupted stretch in your week so far.",
      },
    ],
  },
  {
    id: "c5",
    title: "Summarise this week's meetings",
    updatedAt: dayOffset(-11),
    messages: [
      { id: "m11", role: "user", content: "Summarise my meetings this week." },
      {
        id: "m12",
        role: "assistant",
        content: `You had 11 meetings totalling 7h 15m.

- **Acme** took 3h 30m across four sessions
- **Internal syncs** took 2h 15m
- **1:1s** took 1h 30m

Wednesday was your only meeting-free morning.`,
      },
    ],
  },
];

export const weather = {
  temp: 27,
  condition: "Partly cloudy",
  high: 31,
  low: 23,
  location: "Kolkata",
};

export const briefing = `You have a fairly busy morning with three meetings before lunch. Your design review at 11:30 is the most important event today — the homepage wireframes are due at 11:00, so that's the first thing worth finishing. Four tasks are due, including the client proposal. The afternoon is relatively open, which may be a good time for focused work.`;

export const userName = "Shantanu";

/** Events spread across nearby months so the calendar has something to show. */
export interface DatedEvent extends CalendarEvent {
  date: string;
}

export const datedEvents: DatedEvent[] = [
  ...events.map((e) => ({ ...e, date: TODAY })),
  {
    id: "d1",
    title: "Dentist appointment",
    date: dayOffset(-9),
    start: "09:30",
    durationMin: 45,
    location: "Smile Clinic",
    calendar: "Personal",
  },
  {
    id: "d2",
    title: "Quarterly review",
    date: dayOffset(-5),
    start: "15:00",
    durationMin: 60,
    location: "Meet",
    calendar: "Work",
  },
  {
    id: "d3",
    title: "Yoga class",
    date: dayOffset(-2),
    start: "07:00",
    durationMin: 60,
    calendar: "Personal",
  },
  {
    id: "d4",
    title: "Sprint planning",
    date: dayOffset(1),
    start: "10:00",
    durationMin: 45,
    location: "Meet",
    calendar: "Work",
  },
  {
    id: "d5",
    title: "Coffee with Meera",
    date: dayOffset(1),
    start: "16:30",
    durationMin: 45,
    location: "Blue Tokai",
    calendar: "Personal",
  },
  {
    id: "d6",
    title: "Client workshop",
    date: dayOffset(3),
    start: "11:00",
    durationMin: 120,
    location: "Acme HQ",
    calendar: "Work",
  },
  { id: "d7", title: "Anika's recital", date: dayOffset(4), allDay: true, calendar: "Personal" },
  {
    id: "d8",
    title: "Design critique",
    date: dayOffset(6),
    start: "14:00",
    durationMin: 60,
    calendar: "Work",
  },
  {
    id: "d9",
    title: "Weekend hike",
    date: dayOffset(9),
    start: "06:30",
    durationMin: 180,
    location: "Nandi Hills",
    calendar: "Personal",
  },
  {
    id: "d10",
    title: "Product all-hands",
    date: dayOffset(12),
    start: "17:00",
    durationMin: 60,
    calendar: "Work",
  },
  {
    id: "d11",
    title: "Flight to Tokyo",
    date: dayOffset(18),
    start: "22:10",
    durationMin: 420,
    calendar: "Personal",
  },
  {
    id: "d12",
    title: "Roadmap sync",
    date: dayOffset(24),
    start: "12:00",
    durationMin: 30,
    calendar: "Work",
  },
];
