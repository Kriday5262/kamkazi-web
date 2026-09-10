import { createFileRoute } from "@tanstack/react-router";
import { TasksScreen } from "@/components/tasks-screen";

export const Route = createFileRoute("/tasks/$listId")({
  head: () => ({
    meta: [
      { title: "Task list — Kamkazi" },
      {
        name: "description",
        content: "A focused view of one task list, with due dates, priorities and subtasks.",
      },
      { property: "og:title", content: "Task list — Kamkazi" },
      {
        property: "og:description",
        content: "A focused view of one task list, with due dates, priorities and subtasks.",
      },
    ],
  }),
  component: ListRoute,
});

function ListRoute() {
  const { listId } = Route.useParams();
  return <TasksScreen listId={listId} />;
}
