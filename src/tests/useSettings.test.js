import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  normalizeSettings,
} from "../composables/useSettings";

function memStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
}

describe("loadSettings / saveSettings", () => {
  it("returns defaults when empty", () => {
    expect(loadSettings(memStorage())).toEqual(DEFAULT_SETTINGS);
  });
  it("returns defaults on corrupt JSON", () => {
    expect(loadSettings(memStorage({ "calendar:settings": "x" })).theme).toBe(
      DEFAULT_SETTINGS.theme
    );
  });
  it("round-trips merged settings", () => {
    const s = memStorage();
    saveSettings(s, { ...DEFAULT_SETTINGS, weekStart: 0 });
    expect(loadSettings(s).weekStart).toBe(0);
  });
});

describe("normalizeSettings", () => {
  it("clamps unknown theme back to default", () => {
    expect(normalizeSettings({ theme: "nope" }).theme).toBe(DEFAULT_SETTINGS.theme);
  });
  it("weekStart must be 0 or 1", () => {
    expect(normalizeSettings({ weekStart: 5 }).weekStart).toBe(DEFAULT_SETTINGS.weekStart);
    expect(normalizeSettings({ weekStart: 0 }).weekStart).toBe(0);
  });
  it("clamps unknown tray enum fields", () => {
    const t = normalizeSettings({ tray: { month: "zzz", day: "qq", week: "x" } }).tray;
    expect(t.month).toBe(DEFAULT_SETTINGS.tray.month);
    expect(t.day).toBe(DEFAULT_SETTINGS.tray.day);
    expect(t.week).toBe(DEFAULT_SETTINGS.tray.week);
  });
  it("removes legacy trayIconMode and migrates", () => {
    const s = normalizeSettings({ trayIconMode: "lunar" });
    expect(s.trayIconMode).toBeUndefined();
    expect(s.tray.day).toBe("lunar");
  });
  it("migrates legacy icon mode", () => {
    expect(normalizeSettings({ trayIconMode: "icon" }).tray.iconOnly).toBe(true);
  });
  it("existing tray config is not overridden by legacy field", () => {
    const s = normalizeSettings({ tray: { day: "lunar" }, trayIconMode: "icon" });
    expect(s.tray.day).toBe("lunar");
    expect(s.tray.iconOnly).toBe(false);
  });
  it("dockVisible defaults to true", () => {
    expect(normalizeSettings({}).dockVisible).toBe(true);
  });
  it("dockVisible coerced to boolean", () => {
    expect(normalizeSettings({ dockVisible: false }).dockVisible).toBe(false);
    expect(normalizeSettings({ dockVisible: "x" }).dockVisible).toBe(true);
  });
  it("dockVisible round-trips through storage", () => {
    const s = memStorage();
    saveSettings(s, { ...DEFAULT_SETTINGS, dockVisible: false });
    expect(loadSettings(s).dockVisible).toBe(false);
  });
  it("syncSystemCalendar defaults to false", () => {
    expect(normalizeSettings({}).syncSystemCalendar).toBe(false);
  });
  it("syncSystemCalendar coerced to boolean true only when explicitly true", () => {
    expect(normalizeSettings({ syncSystemCalendar: true }).syncSystemCalendar).toBe(true);
    expect(normalizeSettings({ syncSystemCalendar: "yes" }).syncSystemCalendar).toBe(false);
  });
  it("showXxxShowEmpty defaults are correct", () => {
    const s = normalizeSettings({});
    expect(s.remindersShowEmpty).toBe(true); // 默认显示
    expect(s.systemCalendarShowEmpty).toBe(true); // 默认显示
    expect(s.myEventsShowEmpty).toBe(false); // 默认不显示(节省空间)
  });
  it("showXxxShowEmpty coerced to boolean", () => {
    expect(normalizeSettings({ remindersShowEmpty: false }).remindersShowEmpty).toBe(false);
    expect(normalizeSettings({ systemCalendarShowEmpty: "x" }).systemCalendarShowEmpty).toBe(true);
    expect(normalizeSettings({ myEventsShowEmpty: true }).myEventsShowEmpty).toBe(true);
  });
});
