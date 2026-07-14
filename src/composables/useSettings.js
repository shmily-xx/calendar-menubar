import { ref, watch } from "vue";

const KEY = "calendar:settings";

export const DEFAULT_SETTINGS = {
  tray: {
    iconOnly: false,
    month: "off", // "off" | "num" (7月) | "num2" (07月) | "lunar" (五月)
    day: "num", // "off" | "num" (11) | "lunar" (廿六)
    week: "off", // "off" | "short" (五) | "mid" (周五) | "long" (星期五)
    countdown: false, // 距下次放假
    size: "normal", // "compact" | "normal" | "large"
  },
  weekStart: 1, // 1 = Monday, 0 = Sunday
  theme: "auto", // "auto" | "light" | "dark"
  showLunar: true,
  showHolidays: true,
  dockVisible: true, // macOS Dock 图标是否显示
  syncSystemCalendar: false, // 是否同步系统日历事件(只读)
  showReminders: true, // 显示提醒事项模块
  remindersShowEmpty: true, // 无提醒时是否显示模块(开关打开时)
  showSystemCalendar: true, // 显示系统日历模块
  systemCalendarShowEmpty: true, // 无事件时是否显示模块(开关打开时)
  showMyEvents: true, // 显示我的事件模块
  myEventsShowEmpty: false, // 无事件时是否显示模块(开关打开时)
};

const TRAY_MONTHS = ["off", "num", "num2", "lunar"];
const TRAY_DAYS = ["off", "num", "lunar"];
const TRAY_WEEKS = ["off", "short", "mid", "long"];
const TRAY_SIZES = ["compact", "normal", "large"];
const THEMES = ["auto", "light", "dark"];

// 从旧版 trayIconMode 迁移到新的可组合 tray 配置
function migrateLegacyMode(mode) {
  if (mode === "icon") return { ...DEFAULT_SETTINGS.tray, iconOnly: true };
  if (mode === "lunar") return { ...DEFAULT_SETTINGS.tray, day: "lunar" };
  if (mode === "date") return { ...DEFAULT_SETTINGS.tray, day: "num" };
  return { ...DEFAULT_SETTINGS.tray };
}

function normalizeTray(raw, legacyMode) {
  let t =
    raw && typeof raw === "object" ? { ...DEFAULT_SETTINGS.tray, ...raw } : { ...DEFAULT_SETTINGS.tray };
  if (!TRAY_MONTHS.includes(t.month)) t.month = DEFAULT_SETTINGS.tray.month;
  if (!TRAY_DAYS.includes(t.day)) t.day = DEFAULT_SETTINGS.tray.day;
  if (!TRAY_WEEKS.includes(t.week)) t.week = DEFAULT_SETTINGS.tray.week;
  if (!TRAY_SIZES.includes(t.size)) t.size = DEFAULT_SETTINGS.tray.size;
  t.iconOnly = t.iconOnly === true;
  t.countdown = t.countdown === true;
  // 仅当完全没有 tray 配置时才用旧字段迁移
  if (legacyMode && !(raw && typeof raw === "object")) {
    t = migrateLegacyMode(legacyMode);
  }
  return t;
}

export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  s.tray = normalizeTray(raw && raw.tray, raw && raw.trayIconMode);
  delete s.trayIconMode;
  if (!THEMES.includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
  if (s.weekStart !== 0 && s.weekStart !== 1) s.weekStart = DEFAULT_SETTINGS.weekStart;
  s.showLunar = s.showLunar !== false;
  s.showHolidays = s.showHolidays !== false;
  s.dockVisible = s.dockVisible !== false;
  s.syncSystemCalendar = s.syncSystemCalendar === true;
  s.showReminders = s.showReminders !== false;
  s.remindersShowEmpty = s.remindersShowEmpty !== false;
  s.showSystemCalendar = s.showSystemCalendar !== false;
  s.systemCalendarShowEmpty = s.systemCalendarShowEmpty !== false;
  s.showMyEvents = s.showMyEvents !== false;
  s.myEventsShowEmpty = s.myEventsShowEmpty !== false; // 默认：无事件不显示
  return s;
}

export function loadSettings(storage) {
  try {
    const raw = storage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  storage.setItem(KEY, JSON.stringify(normalizeSettings(settings)));
}

export function useSettings(storage = localStorage) {
  const settings = ref(loadSettings(storage));
  watch(
    settings,
    (v) => saveSettings(storage, v),
    { deep: true }
  );
  function update(patch) {
    settings.value = normalizeSettings({ ...settings.value, ...patch });
  }
  // 跨窗口同步:设置窗口写入 localStorage 后,主窗口(托盘/日历)即时刷新。
  // storage 事件只在「其它」窗口触发,故不会自激循环。
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) settings.value = loadSettings(storage);
    });
  }
  return { settings, update };
}
