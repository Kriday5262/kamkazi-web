import { createFileRoute } from "@tanstack/react-router";
import { TasksScreen } from "@/components/tasks-screen";

export const Route = createFileRoute("/tasks/")({
  head: () => ({
    meta: [
      { title: "Tasks — Kamkazi" },
      {
        name: "description",
        content: "Everything due today across your lists, with priorities, subtasks and reminders.",
      },
      { property: "og:title", content: "Tasks — Kamkazi" },
      {
        property: "og:description",
        content: "Everything due today across your lists, with priorities, subtasks and reminders.",
      },
    ],
  }),
  component: () => <TasksScreen listId="today" />,
});
