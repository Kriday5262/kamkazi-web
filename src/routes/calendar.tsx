import { createFileRoute } from "@tanstack/react-router";
import { CalendarScreen } from "@/components/calendar-screen";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Kamkazi" },
      {
        name: "description",
        content:
          "A month at a glance with dots for busy days, plus the full agenda for any date you pick.",
      },
      { property: "og:title", content: "Calendar — Kamkazi" },
      {
        property: "og:description",
        content:
          "A month at a glance with dots for busy days, plus the full agenda for any date you pick.",
      },
    ],
  }),
  component: CalendarScreen,
});
