import { describe, expect, it } from "vitest";

import {
  applePriorityToKamkazi,
  kamkaziPriorityToApple,
  loadAppleConfig,
  reopenVcalendar,
} from "@/server/apple-reminders-sync.server";

describe("applePriorityToKamkazi", () => {
  it("maps 0/falsy to none", () => {
    expect(applePriorityToKamkazi(0)).toBe("none");
  });
  it("maps 1..4 to high, 5..6 to medium, 7+ to low", () => {
    expect(applePriorityToKamkazi(1)).toBe("high");
    expect(applePriorityToKamkazi(4)).toBe("high");
    expect(applePriorityToKamkazi(5)).toBe("medium");
    expect(applePriorityToKamkazi(6)).toBe("medium");
    expect(applePriorityToKamkazi(9)).toBe("low");
  });
});

describe("kamkaziPriorityToApple", () => {
  it("round-trips through applePriorityToKamkazi", () => {
    // high->1->high, medium->5->medium, low->9->low, none->0->none
    for (const p of ["high", "medium", "low", "none"] as const) {
      expect(applePriorityToKamkazi(kamkaziPriorityToApple(p))).toBe(p);
    }
  });
});

describe("loadAppleConfig", () => {
  it("returns null when appleReminders block is missing or incomplete", () => {
    expect(loadAppleConfig({})).toBeNull();
    expect(loadAppleConfig({ appleReminders: { appleId: "x" } })).toBeNull();
  });
  it("filters non-string list names and defaults enabled to true", () => {
    const cfg = loadAppleConfig({
      appleReminders: {
        appleId: "me@example.com",
        appPasswordEnc: "enc",
        listNames: ["Reminders", 42, "Routine"],
      },
    });
    expect(cfg).not.toBeNull();
    expect(cfg?.listNames).toEqual(["Reminders", "Routine"]);
    expect(cfg?.enabled).toBe(true);
  });
});

describe("reopenVcalendar", () => {
  it("strips COMPLETED and rewrites STATUS to NEEDS-ACTION inside VTODO", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTODO",
      "UID:u1",
      "STATUS:COMPLETED",
      "COMPLETED:20260101T000000Z",
      "SUMMARY:Buy milk",
      "END:VTODO",
      "END:VCALENDAR",
    ].join("\r\n");
    const out = reopenVcalendar(raw);
    expect(out).not.toMatch(/^COMPLETED:/m);
    expect(out).toMatch(/^STATUS:NEEDS-ACTION$/m);
    expect(out).not.toMatch(/^STATUS:COMPLETED$/m);
    expect(out).toContain("SUMMARY:Buy milk");
  });
});
