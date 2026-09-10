import { createFileRoute } from "@tanstack/react-router";
import { FilesScreen } from "@/components/files-screen";

export const Route = createFileRoute("/files")({
  head: () => ({
    meta: [
      { title: "Files — Kamkazi" },
      {
        name: "description",
        content: "Browse, view and manage the files on your personal drive.",
      },
      { property: "og:title", content: "Files — Kamkazi" },
      { property: "og:description", content: "Browse, view and manage your personal drive files." },
    ],
  }),
  component: FilesScreen,
});