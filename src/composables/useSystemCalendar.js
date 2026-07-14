import { ref } from "vue";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { bucketByDate, bucketReminders } from "../utils/systemCalendar";

// 同步系统日历事件 + 提醒事项(只读)。两个数据源各自独立权限。
// getEnabled: () => boolean —— 总开关。
// invoke: 默认走 Tauri;测试可注入。
export function useSystemCalendar(getEnabled, invoke = tauriInvoke) {
  const systemEventsByDate = ref({});
  const systemRemindersByDate = ref({});
  const calendarStatus = ref("idle"); // idle|loading|ok|denied|error|unsupported
  const remindersStatus = ref("idle");

  async function fetchRange(startEpoch, endEpoch) {
    if (!getEnabled()) {
      clear();
      return;
    }
    calendarStatus.value = "loading";
    remindersStatus.value = "loading";
    try {
      const payload = await invoke("fetch_system_events", { start: startEpoch, end: endEpoch });
      if (!payload) {
        calendarStatus.value = "error";
        remindersStatus.value = "error";
        return;
      }
      calendarStatus.value = payload.calendarStatus || "error";
      remindersStatus.value = payload.remindersStatus || "error";
      systemEventsByDate.value =
        payload.calendarStatus === "ok" ? bucketByDate(payload.events || []) : {};
      systemRemindersByDate.value =
        payload.remindersStatus === "ok" ? bucketReminders(payload.reminders || []) : {};
    } catch {
      calendarStatus.value = "error";
      remindersStatus.value = "error";
    }
  }

  function clear() {
    systemEventsByDate.value = {};
    systemRemindersByDate.value = {};
    calendarStatus.value = "idle";
    remindersStatus.value = "idle";
  }

  return { systemEventsByDate, systemRemindersByDate, calendarStatus, remindersStatus, fetchRange, clear };
}
