/**
 * Server boot (Phase 5) — start the reminder scheduler as soon as the Nitro
 * node-server process boots, so due-time pushes and the 08:00 IST digest fire
 * even when nobody has the app open. Idempotent; recompute on boot via the
 * first tick (reminder_state keeps it from double-sending).
 */
export function startSchedulerAtBoot() {
  // Dynamic import: keeps the DB layer out of any client graph.
  import("@/server/reminders.server")
    .then((m) => m.startReminderScheduler())
    .catch((err) => console.error("[reminders] boot start failed:", err));
}
startSchedulerAtBoot();