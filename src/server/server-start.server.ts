/**
 * Server boot (Phase 5) — start the reminder scheduler AND the Apple Reminders
 * sync scheduler as soon as the Nitro node-server process boots, so due-time
 * pushes, the 08:00 IST digest, and Reminders sync all run even when nobody
 * has the app open. Idempotent; recompute on boot via the first tick
 * (reminder_state / sync state keep them from double-applying).
 */
export function startSchedulerAtBoot() {
  // Dynamic imports: keep the DB layer out of any client graph.
  import("@/server/reminders.server")
    .then((m) => m.startReminderScheduler())
    .catch((err) => console.error("[reminders] boot start failed:", err));
  import("@/server/apple-reminders-sync.server")
    .then((m) => m.startAppleRemindersScheduler())
    .catch((err) => console.error("[apple-reminders] boot start failed:", err));
}
startSchedulerAtBoot();