import { describe, it, expect } from "vitest";
import {
  toKey,
  shiftMonth,
  buildMonthMatrix,
  getDayInfo,
  useCalendar,
} from "../composables/useCalendar";

describe("toKey", () => {
  it("zero-pads month and day", () => {
    expect(toKey(2026, 7, 9)).toBe("2026-07-09");
    expect(toKey(2026, 12, 5)).toBe("2026-12-05");
  });
});

describe("shiftMonth", () => {
  it("wraps previous year", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("wraps next year", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
  it("shifts within a year", () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
  });
});

describe("buildMonthMatrix", () => {
  const cells = buildMonthMatrix(2026, 7); // July 2026 has 31 days
  it("returns 42 cells", () => {
    expect(cells).toHaveLength(42);
  });
  it("first cell is a Monday", () => {
    const c = cells[0];
    const wd = new Date(c.year, c.month - 1, c.day).getDay();
    expect((wd + 6) % 7).toBe(0); // Monday-based
  });
  it("contains exactly the month's in-month days 1..31", () => {
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth.map((c) => c.day).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1)
    );
  });
  it("every cell has a zero-padded key", () => {
    expect(cells[0].key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getDayInfo (lunar/festival/jieqi)", () => {
  it("solar festival 劳动节 wins (2019-05-01)", () => {
    const info = getDayInfo(2019, 5, 1);
    expect(info.festivals).toContain("劳动节");
    expect(info.label).toBe("劳动节");
    expect(info.kind).toBe("festival");
  });
  it("jieqi 冬至 when no festival (2021-12-21)", () => {
    const info = getDayInfo(2021, 12, 21);
    expect(info.jieqi).toBe("冬至");
    expect(info.label).toBe("冬至");
    expect(info.kind).toBe("jieqi");
  });
  it("falls back to lunar day name otherwise (2019-05-02)", () => {
    const info = getDayInfo(2019, 5, 2);
    expect(info.kind).toBe("lunar");
    expect(info.label).toBe(info.lunarDay);
  });
});

describe("useCalendar day rollover", () => {
  it("todayKey reflects the injected today at start", () => {
    const fake = { year: 2026, month: 7, day: 9 };
    const { todayKey } = useCalendar(() => 1, { getToday: () => fake });
    expect(todayKey.value).toBe("2026-07-09");
  });

  it("refreshToday updates todayKey when the day changes", () => {
    let fake = { year: 2026, month: 7, day: 9 };
    const { todayKey, refreshToday } = useCalendar(() => 1, { getToday: () => fake });
    expect(todayKey.value).toBe("2026-07-09");
    fake = { year: 2026, month: 7, day: 10 };
    expect(refreshToday()).toBe(true);
    expect(todayKey.value).toBe("2026-07-10");
  });

  it("refreshToday returns false when the day is unchanged", () => {
    const fake = { year: 2026, month: 7, day: 9 };
    const { refreshToday } = useCalendar(() => 1, { getToday: () => fake });
    expect(refreshToday()).toBe(false);
  });

  it("goToday targets the live today after a rollover", () => {
    let fake = { year: 2026, month: 7, day: 9 };
    const { goToday, year, month, refreshToday } = useCalendar(() => 1, { getToday: () => fake });
    fake = { year: 2026, month: 8, day: 1 };
    refreshToday();
    goToday();
    expect(year.value).toBe(2026);
    expect(month.value).toBe(8);
  });
});
