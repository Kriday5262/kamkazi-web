import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/company")({
  head: () => ({
    meta: [
      { title: "Kamkazi — your calm daily workspace" },
      {
        name: "description",
        content:
          "Kamkazi is a personal productivity workspace: tasks, notes, calendar, email reader, files, and an AI assistant. Operated by Shantanu Chaturvedi.",
      },
      { property: "og:title", content: "Kamkazi — your calm daily workspace" },
    ],
  }),
  component: CompanyHome,
});

function CompanyHome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <div className="flex items-center gap-3">
          <img src="/icon-512.png" alt="Kamkazi" className="size-12 rounded-xl" />
          <h1 className="text-[28px] font-extrabold tracking-tight">Kamkazi</h1>
        </div>

        <p className="mt-6 text-[15px] leading-relaxed text-foreground/90">
          Kamkazi is a <strong>personal productivity workspace</strong> — a calm, single-user web
          app that brings the day together: tasks and subtasks, notes, a live calendar Agenda, a
          read-only email inbox view, personal files, and an AI assistant that summarizes the day.
        </p>

        <h2 className="mt-8 text-[17px] font-bold tracking-tight">What it does</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-foreground/85">
          <li>Manage tasks, subtasks, and notes with reminders and recurrences.</li>
          <li>See your Google Calendar events in a clean agenda view (read-only).</li>
          <li>Read recent Gmail inbox messages and turn them into tasks (read-only).</li>
          <li>Log daily work in a timesheet with AI-generated day journals.</li>
          <li>Chat with a personal AI assistant that manages your tasks and notes.</li>
          <li>Store files on your own self-hosted drive.</li>
        </ul>

        <h2 className="mt-8 text-[17px] font-bold tracking-tight">Google data usage</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-foreground/85">
          Kamkazi requests <em>read-only</em> access to the connecting user's Google Calendar
          events and Gmail messages. The app never sends, modifies, or deletes your email or
          events. Data is stored only on the operator's own self-hosted server and is never
          shared, sold, or used for advertising. See the{" "}
          <Link to="/privacy" className="font-semibold text-primary underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/terms" className="font-semibold text-primary underline">
            Terms of Use
          </Link>
          .
        </p>

        <h2 className="mt-8 text-[17px] font-bold tracking-tight">Who operates it</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-foreground/85">
          Kamkazi is built and operated by <strong>Shantanu Chaturvedi</strong> (Dehradun, India)
          as a personal productivity tool. Contact:{" "}
          <a href="mailto:shantanu@kamkazi.com" className="font-semibold text-primary underline">
            shantanu@kamkazi.com
          </a>
          .
        </p>

        <p className="mt-10 text-[12.5px] text-muted-foreground">
          © 2026 Shantanu Chaturvedi ·{" "}
          <Link to="/privacy" className="underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link to="/terms" className="underline">
            Terms
          </Link>
        </p>
      </main>
    </div>
  );
}