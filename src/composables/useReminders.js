import { watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

// 纯函数(测试用):判断会话期间哪些事件到点。
export function getDueEvents(todayEvents, now, sessionStart, fired) {
  return todayEvents.filter(
    (e) =>
      e.notify &&
      e.time >= sessionStart &&
      e.time <= now &&
      !fired.has(e.id)
  );
}

// 事件 UUID → 稳定正整数(iOS UNNotificationRequest identifier 用字符串,这里取正整数)
export function numericId(eventId) {
  let h = 5381;
  for (let i = 0; i < eventId.length; i++) {
    h = ((h << 5) + h + eventId.charCodeAt(i)) >>> 0;
  }
  return (h % 2_000_000_000) + 1;
}

// key=YYYY-M-D + time=HH:MM → 触发时间戳(ms)
export function eventTimestamp(key, time) {
  const [y, m, d] = key.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  if ([y, m, d, hh, mm].some(Number.isNaN)) return NaN;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

// 把所有 notify 事件调度为系统本地通知(经 cal-sync 插件 Swift UNUserNotificationCenter,
// 绕过 tauri-plugin-notification 的 iOS schedule bug)。事件变化时取消旧的 + 重新调度。
export function useReminders(eventsByDate) {
  let lastIds = [];

  async function cancelAll() {
    if (!lastIds.length) return;
    try {
      await invoke("plugin:cal-sync|cancel_notifications", { payload: { ids: lastIds } });
    } catch { /* 非 Tauri/插件未就绪 */ }
    lastIds = [];
  }

  async function reschedule() {
    const hasNotify = Object.values(eventsByDate.value).some((list) =>
      list.some((e) => e.notify)
    );

    if (!hasNotify) {
      await cancelAll();
      return;
    }

    await cancelAll();
    const now = Date.now();
    const nextIds = [];
    for (const [key, list] of Object.entries(eventsByDate.value)) {
      for (const ev of list) {
        if (!ev.notify) continue;
        const at = eventTimestamp(key, ev.time);
        if (Number.isNaN(at) || at <= now) continue; // 过去的不调度
        const nid = numericId(ev.id);
        nextIds.push(nid);
        try {
          await invoke("plugin:cal-sync|schedule_notification", {
            payload: { id: nid, title: "日历提醒", body: `${ev.title} · ${ev.time}`, atMs: at },
          });
        } catch { /* ignore */ }
      }
    }
    lastIds = nextIds;
  }

  watch(eventsByDate, reschedule, { deep: true });
  reschedule();
}
