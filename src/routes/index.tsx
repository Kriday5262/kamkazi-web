import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { TodayScreen } from "@/components/today-screen";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Kamkazi, your calm daily workspace" },
      {
        name: "description",
        content:
          "A daily briefing, one timeline for meetings and tasks, quick capture and an assistant that understands your day.",
      },
      { property: "og:title", content: "Today — Kamkazi, your calm daily workspace" },
      {
        property: "og:description",
        content:
          "A daily briefing, one timeline for meetings and tasks, quick capture and an assistant that understands your day.",
      },
    ],
  }),
  component: StartPageRedirect,
});

/** Respect the "Start page" setting: bounce to the chosen section on landing. */
function StartPageRedirect() {
  const { settings } = useStore();
  const navigate = useNavigate();
  const startPage = settings.startPage ?? "Today";
  useEffect(() => {
    const target =
      startPage === "Agenda"
        ? "/calendar"
        : startPage === "Notes"
          ? "/notes"
          : startPage === "Chat"
            ? "/chat"
            : null; // "Today" stays here
    if (target && window.location.pathname === "/") {
      void navigate({ to: target, replace: true });
    }
  }, [startPage, navigate]);
  return <TodayScreen />;
}
