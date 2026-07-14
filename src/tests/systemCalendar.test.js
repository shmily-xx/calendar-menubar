import { describe, it, expect } from "vitest";
import {
  bucketByDate,
  bucketReminders,
  epochStartOfDay,
  epochEndOfDay,
  localDateKey,
} from "../utils/systemCalendar";

describe("localDateKey", () => {
  it("formats a Date to YYYY-MM-DD in local tz", () => {
    const d = new Date(2026, 6, 13, 5, 30, 0); // local Jul 13 2026 05:30
    expect(localDateKey(d)).toBe("2026-07-13");
  });
});

describe("epoch helpers", () => {
  it("epochStartOfDay is local midnight, end is local 23:59:59", () => {
    const start = epochStartOfDay(2026, 7, 13);
    const end = epochEndOfDay(2026, 7, 13);
    expect(new Date(start * 1000).getHours()).toBe(0);
    expect(new Date(end * 1000).getHours()).toBe(23);
    expect(new Date(start * 1000).getDate()).toBe(13);
  });
});

describe("bucketByDate", () => {
  it("non-all-day event falls on its local start day", () => {
    // 2026-07-13T05:00:00Z -> local same-day or shifted depending on tz; use a local-noon instant
    const iso = new Date(2026, 6, 13, 12, 0, 0).toISOString();
    const buckets = bucketByDate([{ id: "1", title: "Lunch", startISO: iso, endISO: iso, allDay: false, calendarTitle: "Work", calendarColor: "#FF0000", location: null }]);
    expect(Object.keys(buckets)).toEqual(["2026-07-13"]);
    expect(buckets["2026-07-13"]).toHaveLength(1);
  });

  it("all-day single-day event falls on exactly that day", () => {
    const start = new Date(2026, 6, 13, 0, 0, 0).toISOString();
    const end = new Date(2026, 6, 14, 0, 0, 0).toISOString(); // exclusive
    const buckets = bucketByDate([{ id: "1", title: "Off", startISO: start, endISO: end, allDay: true, calendarTitle: "P", calendarColor: "#00FF00", location: null }]);
    expect(Object.keys(buckets)).toEqual(["2026-07-13"]);
  });

  it("all-day multi-day event spans each day (exclusive end)", () => {
    const start = new Date(2026, 6, 13, 0, 0, 0).toISOString();
    const end = new Date(2026, 6, 16, 0, 0, 0).toISOString(); // Jul 13,14,15
    const buckets = bucketByDate([{ id: "1", title: "Trip", startISO: start, endISO: end, allDay: true, calendarTitle: "P", calendarColor: "#0000FF", location: null }]);
    expect(Object.keys(buckets).sort()).toEqual(["2026-07-13", "2026-07-14", "2026-07-15"]);
  });

  it("multiple events aggregate into the same bucket", () => {
    const iso = new Date(2026, 6, 13, 9, 0, 0).toISOString();
    const buckets = bucketByDate([
      { id: "1", title: "A", startISO: iso, endISO: iso, allDay: false, calendarTitle: "W", calendarColor: "#111111", location: null },
      { id: "2", title: "B", startISO: iso, endISO: iso, allDay: false, calendarTitle: "W", calendarColor: "#111111", location: null },
    ]);
    expect(buckets["2026-07-13"]).toHaveLength(2);
  });
});

describe("bucketReminders", () => {
  it("buckets a reminder by its due day", () => {
    const due = new Date(2026, 6, 13, 8, 0, 0).toISOString();
    const buckets = bucketReminders([{ id: "r1", title: "Pay rent", dueISO: due, allDay: false, calendarTitle: "R", calendarColor: "#00FF00", priority: 1 }]);
    expect(Object.keys(buckets)).toEqual(["2026-07-13"]);
    expect(buckets["2026-07-13"]).toHaveLength(1);
  });

  it("all-day reminder still falls on its single due day", () => {
    const due = new Date(2026, 6, 13, 0, 0, 0).toISOString();
    const buckets = bucketReminders([{ id: "r1", title: "X", dueISO: due, allDay: true, calendarTitle: "R", calendarColor: "#000", priority: 0 }]);
    expect(Object.keys(buckets)).toEqual(["2026-07-13"]);
  });
});
