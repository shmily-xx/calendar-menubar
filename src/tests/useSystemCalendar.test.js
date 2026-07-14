import { describe, it, expect, vi } from "vitest";
import { useSystemCalendar } from "../composables/useSystemCalendar";

function fakeInvoke(payload) {
  return vi.fn().mockResolvedValue(payload);
}

const evIso = new Date(2026, 6, 13, 9, 0, 0).toISOString();
const remDue = new Date(2026, 6, 13, 8, 0, 0).toISOString();

const EVENT = { id: "1", title: "A", startISO: evIso, endISO: evIso, allDay: false, calendarTitle: "W", calendarColor: "#111", location: null };
const REMINDER = { id: "r1", title: "Pay", dueISO: remDue, allDay: false, calendarTitle: "R", calendarColor: "#0f0", priority: 1 };

describe("useSystemCalendar", () => {
  it("disabled: fetchRange clears and stays idle", async () => {
    const invoke = fakeInvoke({ calendarStatus: "ok", events: [], remindersStatus: "ok", reminders: [] });
    const { calendarStatus, remindersStatus, systemEventsByDate, systemRemindersByDate, fetchRange } = useSystemCalendar(() => false, invoke);
    await fetchRange(0, 1);
    expect(invoke).not.toHaveBeenCalled();
    expect(calendarStatus.value).toBe("idle");
    expect(remindersStatus.value).toBe("idle");
    expect(systemEventsByDate.value).toEqual({});
    expect(systemRemindersByDate.value).toEqual({});
  });

  it("both ok: buckets events and reminders separately", async () => {
    const invoke = fakeInvoke({ calendarStatus: "ok", events: [EVENT], remindersStatus: "ok", reminders: [REMINDER] });
    const { calendarStatus, remindersStatus, systemEventsByDate, systemRemindersByDate, fetchRange } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    expect(invoke).toHaveBeenCalledWith("fetch_system_events", { start: 0, end: 1 });
    expect(calendarStatus.value).toBe("ok");
    expect(remindersStatus.value).toBe("ok");
    expect(systemEventsByDate.value["2026-07-13"]).toHaveLength(1);
    expect(systemRemindersByDate.value["2026-07-13"]).toHaveLength(1);
  });

  it("calendar ok, reminders denied: reminders bucket empty, status denied", async () => {
    const invoke = fakeInvoke({ calendarStatus: "ok", events: [EVENT], remindersStatus: "denied" });
    const { remindersStatus, systemRemindersByDate, fetchRange } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    expect(remindersStatus.value).toBe("denied");
    expect(systemRemindersByDate.value).toEqual({});
  });

  it("invoke throws: both error", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("boom"));
    const { calendarStatus, remindersStatus, fetchRange } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    expect(calendarStatus.value).toBe("error");
    expect(remindersStatus.value).toBe("error");
  });

  it("clear() resets state", async () => {
    const invoke = fakeInvoke({ calendarStatus: "ok", events: [EVENT], remindersStatus: "ok", reminders: [REMINDER] });
    const { calendarStatus, systemEventsByDate, systemRemindersByDate, fetchRange, clear } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    clear();
    expect(calendarStatus.value).toBe("idle");
    expect(systemEventsByDate.value).toEqual({});
    expect(systemRemindersByDate.value).toEqual({});
  });
});
