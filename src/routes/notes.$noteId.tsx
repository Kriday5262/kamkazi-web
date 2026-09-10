import { createFileRoute } from "@tanstack/react-router";
import { NoteEditor } from "@/components/note-editor";

export const Route = createFileRoute("/notes/$noteId")({
  head: () => ({
    meta: [
      { title: "Note — Kamkazi" },
      {
        name: "description",
        content: "Write in a calm, full-page Markdown editor with tags, pinning and sharing.",
      },
      { property: "og:title", content: "Note — Kamkazi" },
      {
        property: "og:description",
        content: "Write in a calm, full-page Markdown editor with tags, pinning and sharing.",
      },
    ],
  }),
  component: NoteRoute,
});

function NoteRoute() {
  const { noteId } = Route.useParams();
  return <NoteEditor noteId={noteId} />;
}
