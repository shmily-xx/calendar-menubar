import { onUnmounted } from "vue";
import { toKey, todayParts, nowHHMM } from "./useCalendar";

export function getDueEvents(todayEvents, now, sessionStart, fired) {
  return todayEvents.filter(
    (e) =>
      e.notify &&
      e.time >= sessionStart &&
      e.time <= now &&
      !fired.has(e.id)
  );
}

async function fireNotification(event) {
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) {
      const perm = await mod.requestPermission();
      granted = perm === "granted";
    }
    if (!granted) return;
    mod.sendNotification({ title: "日历提醒", body: `${event.title} · ${event.time}` });
  } catch {
    // Not in Tauri (e.g. plain Vite/vitest): ignore.
  }
}

function defaultTodayKey() {
  const t = todayParts();
  return toKey(t.year, t.month, t.day);
}

export function useReminders(
  eventsByDate,
  { getNow = nowHHMM, getTodayKey = defaultTodayKey, intervalMs = 60_000 } = {}
) {
  const fired = new Set();
  const sessionStart = getNow();

  async function check() {
    const list = eventsByDate.value[getTodayKey()] || [];
    const due = getDueEvents(list, getNow(), sessionStart, fired);
    for (const e of due) {
      fired.add(e.id);
      await fireNotification(e);
    }
  }

  check();
  const timer = setInterval(check, intervalMs);
  onUnmounted(() => clearInterval(timer));
}
