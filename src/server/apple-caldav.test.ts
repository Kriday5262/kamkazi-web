import { describe, expect, it } from "vitest";

import { buildVtodo, completeVcalendar, parseVtodo, todoUrl } from "@/server/apple-caldav.server";

describe("todoUrl", () => {
  it("strips trailing slashes from the list URL and appends <uid>.ics", () => {
    expect(todoUrl("https://caldav.icloud.com/u/calendars/list/", "abc 123")).toBe(
      "https://caldav.icloud.com/u/calendars/list/abc%20123.ics",
    );
  });
});

describe("buildVtodo", () => {
  it("emits DUE as VALUE=DATE when no dueTime is given", () => {
    const out = buildVtodo({ uid: "u1", summary: "Task", dueDate: "2026-03-04", priority: 0 });
    expect(out).toContain("DUE;VALUE=DATE:20260304");
    expect(out).not.toContain("TZID");
  });
  it("escapes commas/semicolons/newlines in SUMMARY", () => {
    const out = buildVtodo({ uid: "u1", summary: "a,b;c\nd", priority: 0 });
    expect(out).toContain("SUMMARY:a\\,b\\;c\\nd");
  });
});

describe("parseVtodo", () => {
  it("returns null when no VTODO block is present", () => {
    expect(parseVtodo("BEGIN:VCALENDAR\r\nEND:VCALENDAR", "h", "", undefined)).toBeNull();
  });
  it("marks STATUS:COMPLETED as completed and reads priority", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTODO",
      "UID:u9",
      "SUMMARY:Done thing",
      "STATUS:COMPLETED",
      "PRIORITY:1",
      "END:VTODO",
      "END:VCALENDAR",
    ].join("\r\n");
    const t = parseVtodo(raw, "https://x/y.ics", "etag-1", undefined);
    expect(t?.completed).toBe(true);
    expect(t?.priority).toBe(1);
    expect(t?.uid).toBe("u9");
  });
  it("boundary: UTC DUE converts to IST (+5:30) across midnight", () => {
    // 2026-01-01 20:00 UTC == 2026-01-02 01:30 IST — date must roll over.
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTODO",
      "UID:u10",
      "SUMMARY:x",
      "DUE:20260101T200000Z",
      "END:VTODO",
      "END:VCALENDAR",
    ].join("\r\n");
    const t = parseVtodo(raw, "h", "", undefined);
    expect(t?.dueDate).toBe("2026-01-02");
    expect(t?.dueTime).toBe("01:30");
  });
});

describe("completeVcalendar", () => {
  it("inserts STATUS:COMPLETED when the VTODO has no STATUS line", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTODO",
      "UID:u2",
      "SUMMARY:x",
      "END:VTODO",
      "END:VCALENDAR",
    ].join("\r\n");
    const out = completeVcalendar(raw);
    expect(out).toMatch(/^STATUS:COMPLETED$/m);
    expect(out).toMatch(/^COMPLETED:\d{8}T\d{6}Z$/m);
  });
});
