import { createFileRoute } from "@tanstack/react-router";
import { TasksScreen } from "@/components/tasks-screen";

export const Route = createFileRoute("/tasks/")({
  head: () => ({
    meta: [
      { title: "Tasks — Kamkazi" },
      {
        name: "description",
        content: "Your master task list, with tags, due dates, priorities and subtasks.",
      },
      { property: "og:title", content: "Tasks — Kamkazi" },
      {
        property: "og:description",
        content: "Your master task list, with tags, due dates, priorities and subtasks.",
      },
    ],
  }),
  component: () => <TasksScreen view="all" />,
});
