import { describe, it, expect } from "vitest";
import { getDueEvents } from "../composables/useReminders";

const events = [
  { id: "1", title: "晨会", time: "09:00", notify: true },
  { id: "2", title: "下午会", time: "14:00", notify: true },
  { id: "3", title: "静默", time: "09:00", notify: false },
];

describe("getDueEvents", () => {
  it("fires events whose time is within [sessionStart, now]", () => {
    const due = getDueEvents(events, "10:00", "08:00", new Set());
    expect(due.map((e) => e.id)).toEqual(["1"]); // 09:00 in window; 14:00 not yet
  });
  it("skips events already fired", () => {
    const due = getDueEvents(events, "10:00", "08:00", new Set(["1"]));
    expect(due).toHaveLength(0);
  });
  it("skips events earlier than session start (no stale catch-up on open)", () => {
    const due = getDueEvents(events, "10:00", "09:30", new Set());
    expect(due.map((e) => e.id)).toEqual([]); // 09:00 < sessionStart 09:30
  });
  it("never includes non-notify events", () => {
    const due = getDueEvents(events, "10:00", "08:00", new Set());
    expect(due.find((e) => e.id === "3")).toBeUndefined();
  });
});
