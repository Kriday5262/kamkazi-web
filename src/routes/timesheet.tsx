import { createFileRoute } from "@tanstack/react-router";
import { JournalScreen as TimesheetScreen } from "@/components/timesheet-screen";

export const Route = createFileRoute("/timesheet")({
  head: () => ({
    meta: [
      { title: "Journal — Kamkazi" },
      {
        name: "description",
        content:
          "Your daily work log: an AI day-journal plus manual timesheet entries, with monthly stats by type and area.",
      },
      { property: "og:title", content: "Journal — Kamkazi" },
    ],
  }),
  component: TimesheetScreen,
});