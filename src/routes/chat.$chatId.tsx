import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "@/components/chat-screen";

export const Route = createFileRoute("/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "AI Chat — Kamkazi" },
      { property: "og:title", content: "AI Chat — Kamkazi" },
    ],
  }),
  component: () => <ChatScreen />,
});