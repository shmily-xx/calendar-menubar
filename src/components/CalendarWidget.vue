<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useCalendar, getDayInfo, weekdayHeader } from "../composables/useCalendar";
import { useEvents } from "../composables/useEvents";
import { useHolidays, nextHolidayFrom, dayStatus } from "../composables/useHolidays";
import { useReminders } from "../composables/useReminders";
import { useSystemCalendar } from "../composables/useSystemCalendar";
import { epochStartOfDay, epochEndOfDay } from "../utils/systemCalendar";
import MonthGrid from "./MonthGrid.vue";
import EventPanel from "./EventPanel.vue";
import AddEventPanel from "./AddEventPanel.vue";

const props = defineProps({
  settings: { type: Object, required: true },
});
defineEmits(["update-settings"]);

const { year, month, todayKey, matrix, prev, next, goToday, refreshToday } = useCalendar(
  () => props.settings.weekStart
);
const { eventsByDate, addEvent, removeEvent, updateEvent } = useEvents();
const { data: holidays, refresh } = useHolidays();

const selectedKey = ref(todayKey.value);
const showAddEvent = ref(false);

// Cross-midnight rollover: re-read "today" and, if the calendar day changed,
// move the "今天" highlight along and follow it with the selection if the user
// hadn't picked another day. Triggered on a periodic tick, on window focus,
// and when the panel becomes visible again (covers wake-from-sleep).
function checkDayRollover() {
  const oldToday = todayKey.value;
  if (!refreshToday()) return;
  if (selectedKey.value === oldToday) selectedKey.value = todayKey.value;
  refreshSystemForWindow();
}
let rolloverTimer = null;
function onVisibility() {
  if (!document.hidden) checkDayRollover();
}

// 系统日历事件 + 提醒事项(只读)。可见窗口 = cells 首格..末格(约 42 天)。
const { systemEventsByDate, systemRemindersByDate, calendarStatus, remindersStatus, fetchRange: fetchSystemRange, clear: clearSystem } = useSystemCalendar(
  () => props.settings.syncSystemCalendar
);
function refreshSystemForWindow() {
  const all = cells.value;
  if (!all.length) return;
  const first = all[0].day;
  const last = all[all.length - 1].day;
  fetchSystemRange(epochStartOfDay(first.year, first.month, first.day), epochEndOfDay(last.year, last.month, last.day));
}
// settings 开关变化:开启就拉、关闭就清
watch(() => props.settings.syncSystemCalendar, (on) => {
  if (on) refreshSystemForWindow();
  else clearSystem();
});

refresh(); // best-effort online refresh

const headers = computed(() => weekdayHeader(props.settings.weekStart));

const cells = computed(() =>
  matrix.value.map((day) => {
    const info = getDayInfo(day.year, day.month, day.day);
    const st = props.settings.showHolidays
      ? dayStatus(holidays.value, day.key, info.weekday)
      : info.weekday === 0 || info.weekday === 6
        ? { kind: "weekend" }
        : { kind: "workday" };
    return {
      day,
      // 法定假日格子直接显示假日名(如「国庆节」),其余显示农历/节气/节日
      label: st.kind === "holiday" && st.name ? st.name : info.label,
      kind: info.kind,
      status: st.kind,
      isToday: day.key === todayKey.value,
      isSelected: day.key === selectedKey.value,
      hasEvent:
        (eventsByDate.value[day.key] || []).length > 0 ||
        (systemRemindersByDate.value[day.key] || []).length > 0,
    };
  })
);

const selectedEvents = computed(() => eventsByDate.value[selectedKey.value] || []);

const selectedLunar = computed(() => {
  const parts = selectedKey.value.split("-").map(Number);
  if (parts.length !== 3) return "";
  const info = getDayInfo(parts[0], parts[1], parts[2]);
  return `${info.lunarMonth}月${info.lunarDay}`;
});

const nextHoliday = computed(() => {
  if (!props.settings.showHolidays) return null;
  return nextHolidayFrom(holidays.value, todayKey.value);
});

useReminders(eventsByDate);

// 动态调整窗口高度
let resizeObserver = null;
let resizeDebounceTimer = null;

async function adjustWindowHeight() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const widget = document.querySelector('.widget');
    if (!widget) return;

    const rect = widget.getBoundingClientRect();
    const height = Math.max(400, Math.ceil(rect.height) + 20); // 最小高度400px,额外20px边距

    const currentSize = await win.innerSize();
    await win.setSize({ width: currentSize.width, height });
  } catch (e) {
    // 忽略错误(可能在非Tauri环境)
  }
}

onMounted(() => {
  rolloverTimer = setInterval(checkDayRollover, 30_000);
  window.addEventListener("focus", checkDayRollover);
  document.addEventListener("visibilitychange", onVisibility);
  if (props.settings.syncSystemCalendar) refreshSystemForWindow();
  watch([year, month], refreshSystemForWindow);

  // 监听内容变化,动态调整窗口高度
  resizeObserver = new ResizeObserver(() => {
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(adjustWindowHeight, 300);
  });
  const widget = document.querySelector('.widget');
  if (widget) resizeObserver.observe(widget);

  // 初始调整
  setTimeout(adjustWindowHeight, 100);
});
onUnmounted(() => {
  if (rolloverTimer) clearInterval(rolloverTimer);
  window.removeEventListener("focus", checkDayRollover);
  document.removeEventListener("visibilitychange", onVisibility);
  if (resizeObserver) resizeObserver.disconnect();
  if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
});

function goTodayAndSelect() {
  goToday();
  selectedKey.value = todayKey.value;
}

// 设置以独立窗口在屏幕中间打开(已存在则聚焦)。
async function openSettings() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel("settings");
  if (existing) {
    await existing.setFocus();
    return;
  }
  // 复用当前页面地址(同源),追加 view=settings,兼容 dev 与打包后环境。
  const url = `${window.location.pathname}?view=settings`;
  await new WebviewWindow("settings", {
    url,
    title: "设置",
    width: 460,
    height: 620,
    resizable: false,
    minimizable: false,
    center: true,
  });
}

function openAddEvent() {
  showAddEvent.value = true;
}

function handleAddEvent(event) {
  addEvent(selectedKey.value, event);
  showAddEvent.value = false;
}
</script>

<template>
  <div class="widget">
    <header class="cw-header">
      <div class="actions">
        <button class="today-btn" @click="goTodayAndSelect" title="回到今天">回今天</button>
        <div class="nav">
          <button class="icon-btn" @click="prev" title="上一月">‹</button>
          <span class="month">{{ year }}年 {{ month }}月</span>
          <button class="icon-btn" @click="next" title="下一月">›</button>
        </div>
        <button class="icon-btn gear" @click="openSettings" title="设置">⚙</button>
      </div>
    </header>

    <MonthGrid
      :cells="cells"
      :headers="headers"
      :show-lunar="settings.showLunar"
      @select="(k) => (selectedKey = k)"
    />

    <EventPanel
      :date-key="selectedKey"
      :lunar-label="selectedLunar"
      :events="selectedEvents"
      :system-events="systemEventsByDate[selectedKey] || []"
      :system-reminders="systemRemindersByDate[selectedKey] || []"
      :calendar-status="calendarStatus"
      :reminders-status="remindersStatus"
      :system-enabled="settings.syncSystemCalendar"
      :next-holiday="nextHoliday"
      :show-reminders="settings.showReminders"
      :reminders-show-empty="settings.remindersShowEmpty"
      :show-system-calendar="settings.showSystemCalendar"
      :system-calendar-show-empty="settings.systemCalendarShowEmpty"
      :show-my-events="settings.showMyEvents"
      :my-events-show-empty="settings.myEventsShowEmpty"
      @add="openAddEvent"
      @remove="removeEvent"
      @update="(e) => updateEvent(e.id, e)"
    />

    <div v-if="showAddEvent" class="overlay">
      <AddEventPanel
        :date-key="selectedKey"
        @save="handleAddEvent"
        @close="showAddEvent = false"
      />
    </div>
  </div>
</template>

<style scoped>
.widget { position: relative; display: flex; flex-direction: column; user-select: none; color: var(--text); background: var(--surface); border-radius: 12px; }
.cw-header { padding: 10px 10px 6px; display: flex; flex-direction: column; gap: 4px; }
.actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; }
.nav { display: flex; align-items: center; justify-content: center; gap: 10px; flex: 1; }
.month { font-size: 14px; font-weight: 600; opacity: 0.9; min-width: 96px; text-align: center; white-space: nowrap; }
.today-btn { flex: none; }
.icon-btn, .today-btn { border: 1px solid var(--border); background: transparent; color: var(--text); font-family: inherit; border-radius: 6px; cursor: pointer; }
.icon-btn { width: 28px; height: 26px; font-size: 16px; line-height: 1; }
.icon-btn.gear { font-size: 14px; }
.today-btn { font-size: 11px; padding: 4px 9px; }
.icon-btn:hover, .today-btn:hover { background: var(--hover); }
:deep(.grid) { padding: 2px 10px 6px; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.25); display: flex; justify-content: center; padding-top: 40px; z-index: 10; }
.overlay > :first-child { width: 100%; background: var(--surface); border-radius: 12px; margin: 0 8px; height: fit-content; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
</style>