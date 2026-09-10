import { createFileRoute, redirect } from "@tanstack/react-router";
import { TasksScreen } from "@/components/tasks-screen";

/**
 * Legacy /tasks/$listId routes. Phase 2 retired lists in favour of tags:
 *   - "today" / "upcoming" keep their smart-view meaning.
 *   - anything else is treated as a URL-encoded tag name (old list URLs
 *     gracefully resolve because migration 0005 mapped list names → tags).
 */
export const Route = createFileRoute("/tasks/$listId")({
  head: () => ({
    meta: [
      { title: "Tasks — Kamkazi" },
      {
        name: "description",
        content: "A focused view of your tasks, with due dates, priorities and subtasks.",
      },
      { property: "og:title", content: "Tasks — Kamkazi" },
      {
        property: "og:description",
        content: "A focused view of your tasks, with due dates, priorities and subtasks.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    const tag = typeof search["tag"] === "string" ? search["tag"] : undefined;
    return tag ? { tag } : {};
  },
  beforeLoad: ({ params }) => {
    // Old bare list ids no longer exist as views — keep URLs resolvable.
    if (params.listId === "all") throw redirect({ to: "/tasks", replace: true });
  },
  component: ListRoute,
});

function ListRoute() {
  const { listId } = Route.useParams();
  const { tag } = Route.useSearch();
  if (listId === "today" || listId === "upcoming") {
    return <TasksScreen view={listId} tagFilter={tag} />;
  }
  const decoded = safeDecode(listId);
  return <TasksScreen view="all" tagFilter={decoded ?? listId} />;
}

function safeDecode(v: string): string | undefined {
  try {
    return decodeURIComponent(v);
  } catch {
    return undefined;
  }
}
