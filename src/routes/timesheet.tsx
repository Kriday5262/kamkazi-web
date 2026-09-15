import { createFileRoute } from "@tanstack/react-router";
import { TimesheetScreen } from "@/components/timesheet-screen";

export const Route = createFileRoute("/timesheet")({
  head: () => ({
    meta: [
      { title: "Timesheet — Kamkazi" },
      {
        name: "description",
        content:
          "Your daily work log: an AI day-journal plus manual timesheet entries, with monthly stats by type and area.",
      },
      { property: "og:title", content: "Timesheet — Kamkazi" },
    ],
  }),
  component: TimesheetScreen,
});