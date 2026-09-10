import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "@/components/chat-screen";

export const Route = createFileRoute("/chat/$chatId")({
  head: () => ({
    meta: [
      { title: "Conversation — Kamkazi" },
      {
        name: "description",
        content: "A conversation with your assistant about tasks, notes and today's schedule.",
      },
      { property: "og:title", content: "Conversation — Kamkazi" },
      {
        property: "og:description",
        content: "A conversation with your assistant about tasks, notes and today's schedule.",
      },
    ],
  }),
  component: ChatRoute,
});

function ChatRoute() {
  const { chatId } = Route.useParams();
  return <ChatScreen chatId={chatId} />;
}
