import { describe, it, expect } from "vitest";
import {
  parseHolidays,
  isHoliday,
  isWorkday,
  holidayLabel,
  nextHolidayFrom,
  dayStatus,
} from "../composables/useHolidays";

// Two sample years merged, mirroring NateScarlet/holiday-cn shape.
const data = parseHolidays([
  {
    days: [
      { name: "元旦", date: "2026-01-01", isOffDay: true },
      { name: "元旦", date: "2026-01-02", isOffDay: true },
      { name: "春节", date: "2026-02-17", isOffDay: true },
      { name: "春节", date: "2026-02-22", isOffDay: false }, // 调休上班
    ],
  },
]);

describe("parseHolidays + lookups", () => {
  it("flags an off-day as holiday", () => {
    expect(isHoliday(data, "2026-01-01")).toBe(true);
    expect(holidayLabel(data, "2026-01-01")).toBe("元旦");
  });
  it("flags a 调休 workday (weekend made working)", () => {
    expect(isWorkday(data, "2026-02-22")).toBe(true);
    expect(isHoliday(data, "2026-02-22")).toBe(false);
  });
  it("returns false / '' for ordinary days", () => {
    expect(isHoliday(data, "2026-03-15")).toBe(false);
    expect(isWorkday(data, "2026-03-15")).toBe(false);
    expect(holidayLabel(data, "2026-03-15")).toBe("");
  });
});

describe("nextHolidayFrom", () => {
  it("finds the next off-day after a given date and counts days", () => {
    const r = nextHolidayFrom(data, "2026-01-03");
    expect(r).not.toBeNull();
    expect(r.name).toBe("春节");
    expect(r.date).toBe("2026-02-17");
    expect(r.daysUntil).toBe(45); // Jan 3 -> Feb 17
  });
  it("returns null when nothing ahead", () => {
    expect(nextHolidayFrom(data, "2026-12-31")).toBeNull();
  });
});

describe("dayStatus", () => {
  // weekday: 0=Sun..6=Sat (lunar-javascript / getDayInfo convention)
  it("holiday: legal off-day carries the name", () => {
    expect(dayStatus(data, "2026-01-01", 4)).toEqual({ kind: "holiday", name: "元旦" });
  });
  it("makeup: 调休 workday (weekend made working) carries the name", () => {
    expect(dayStatus(data, "2026-02-22", 5)).toEqual({ kind: "makeup", name: "春节" });
  });
  it("weekend: regular Sat/Sun not in the map", () => {
    expect(dayStatus(data, "2026-03-15", 0)).toEqual({ kind: "weekend" }); // Sun
    expect(dayStatus(data, "2026-03-21", 6)).toEqual({ kind: "weekend" }); // Sat
  });
  it("workday: regular weekday not in the map", () => {
    expect(dayStatus(data, "2026-03-16", 1)).toEqual({ kind: "workday" }); // Mon
  });
  it("ignores weekday once the day is in the map", () => {
    // 2026-01-01 is a holiday regardless of the weekday passed in
    expect(dayStatus(data, "2026-01-01", 0).kind).toBe("holiday");
  });
});
