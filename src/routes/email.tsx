import { createFileRoute } from "@tanstack/react-router";
import { EmailScreen } from "@/components/email-screen";

export const Route = createFileRoute("/email")({
  head: () => ({
    meta: [
      { title: "Email — Kamkazi" },
      {
        name: "description",
        content: "Read-only inbox across your connected Gmail accounts.",
      },
      { property: "og:title", content: "Email — Kamkazi" },
      { property: "og:description", content: "Read-only inbox across your connected Gmail accounts." },
    ],
  }),
  component: EmailScreen,
});