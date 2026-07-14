<script setup>
import { ref, computed } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getDayInfo } from "../composables/useCalendar";

const props = defineProps({
  dateKey: { type: String, default: "" },
  lunarLabel: { type: String, default: "" },
  events: { type: Array, default: () => [] },
  systemEvents: { type: Array, default: () => [] },
  systemReminders: { type: Array, default: () => [] },
  calendarStatus: { type: String, default: "idle" },
  remindersStatus: { type: String, default: "idle" },
  systemEnabled: { type: Boolean, default: false },
  nextHoliday: { type: Object, default: null },
  showReminders: { type: Boolean, default: true },
  remindersShowEmpty: { type: Boolean, default: true },
  showSystemCalendar: { type: Boolean, default: true },
  systemCalendarShowEmpty: { type: Boolean, default: true },
  showMyEvents: { type: Boolean, default: true },
  myEventsShowEmpty: { type: Boolean, default: false },
});
const emit = defineEmits(["add", "remove", "update"]);

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const dateDisplay = computed(() => {
  const parts = (props.dateKey || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return props.dateKey || "选择日期";
  const [y, m, d] = parts;
  const info = getDayInfo(y, m, d);
  return `${m}月${d}日 周${WEEK[info.weekday]}`;
});

const editingId = ref(null);
const editTitle = ref("");
const editTime = ref("09:00");
const editNotify = ref(false);

function startEdit(event) {
  editingId.value = event.id;
  editTitle.value = event.title;
  editTime.value = event.time;
  editNotify.value = event.notify;
}

function cancelEdit() {
  editingId.value = null;
}

function saveEdit() {
  if (!editTitle.value.trim()) return;
  emit("update", {
    id: editingId.value,
    title: editTitle.value.trim(),
    time: editTime.value,
    notify: editNotify.value,
  });
  editingId.value = null;
}

function addNew() {
  emit("add");
}

const sortedSystem = computed(() =>
  [...props.systemEvents].sort((a, b) => a.startISO.localeCompare(b.startISO))
);
const sortedReminders = computed(() =>
  [...props.systemReminders].sort((a, b) => a.dueISO.localeCompare(b.dueISO))
);
function sysTime(ev) {
  if (ev.allDay) return "全天";
  const d = new Date(ev.startISO);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function remTime(r) {
  if (r.allDay) return "全天";
  const d = new Date(r.dueISO);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
async function openPrivacySettings() {
  try {
    await openUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars");
  } catch {
    /* 非 Tauri 忽略 */
  }
}
</script>

<template>
  <div class="event-panel">
    <div class="event-header">
      <div class="date-block">
        <div class="date-line">{{ dateDisplay }}</div>
        <div class="meta-line">
          <span v-if="lunarLabel">农历{{ lunarLabel }}</span>
          <span v-if="lunarLabel && nextHoliday" class="sep">·</span>
          <span v-if="nextHoliday">距{{ nextHoliday.name }} {{ nextHoliday.daysUntil }}天</span>
        </div>
      </div>
      <button class="add-btn" @click="addNew" title="添加事件">+ 添加</button>
    </div>

    <!-- 提醒事项 -->
    <section v-if="systemEnabled && showReminders && (remindersShowEmpty || sortedReminders.length)" class="section">
      <div class="section-title"><span class="red-dot"></span>提醒事项</div>
      <div v-if="remindersStatus === 'denied'" class="hint" @click="openPrivacySettings">
        未授权访问提醒事项 → 前往系统设置
      </div>
      <div v-else-if="remindersStatus === 'loading'" class="hint muted">同步中…</div>
      <div v-else-if="remindersStatus === 'error'" class="hint muted">同步失败</div>
      <template v-else>
        <div v-for="r in sortedReminders" :key="r.id" class="item">
          <span class="time">{{ remTime(r) }}</span>
          <span class="dot" :style="{ background: r.calendarColor }"></span>
          <span class="title">{{ r.title }}</span>
        </div>
        <div v-if="!sortedReminders.length" class="empty">无提醒事项</div>
      </template>
    </section>

    <!-- 系统日历 -->
    <section v-if="systemEnabled && showSystemCalendar && (systemCalendarShowEmpty || sortedSystem.length)" class="section">
      <div class="section-title">系统日历</div>
      <div v-if="calendarStatus === 'denied'" class="hint" @click="openPrivacySettings">
        未授权访问日历 → 前往系统设置
      </div>
      <div v-else-if="calendarStatus === 'loading'" class="hint muted">同步中…</div>
      <div v-else-if="calendarStatus === 'error'" class="hint muted">同步失败</div>
      <template v-else>
        <div v-for="e in sortedSystem" :key="e.id" class="item">
          <span class="time">{{ sysTime(e) }}</span>
          <span class="dot" :style="{ background: e.calendarColor }"></span>
          <span class="title">{{ e.title }}</span>
        </div>
        <div v-if="!sortedSystem.length" class="empty">无系统日历事件</div>
      </template>
    </section>

    <!-- 我的事件 -->
    <section v-if="showMyEvents && (myEventsShowEmpty || events.length)" class="section">
      <div class="section-title">我的事件</div>
      <div v-for="e in events" :key="e.id" class="item local" @click="startEdit(e)">
        <template v-if="editingId === e.id">
          <input v-model="editTitle" class="edit-title" placeholder="事件标题" @click.stop />
          <input v-model="editTime" class="edit-time" type="time" @click.stop />
          <label class="edit-notify" @click.stop>
            <input type="checkbox" v-model="editNotify" /> 提醒
          </label>
          <button class="save-btn" @click.stop="saveEdit">保存</button>
          <button class="cancel-btn" @click.stop="cancelEdit">取消</button>
        </template>
        <template v-else>
          <span class="time">{{ e.time }}</span>
          <span class="dot accent"></span>
          <span class="title">{{ e.title }}</span>
          <span v-if="e.notify" class="bell">🔔</span>
        </template>
      </div>
      <div v-if="!events.length" class="empty">这一天还没有事件,点击「+ 添加」</div>
    </section>
  </div>
</template>

<style scoped>
.event-panel {
  padding: 0 12px 14px;
  border-top: 1px solid var(--border);
  color: var(--text);
}

/* —— 头部:日期 + 添加按钮 —— */
.event-header {
  padding: 10px 0 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.date-block {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}
.date-line {
  font-size: 13px;
  font-weight: 600;
}
.meta-line {
  font-size: 11px;
  opacity: 0.6;
  display: flex;
  gap: 5px;
  margin-top: 1px;
}
.meta-line .sep {
  opacity: 0.5;
}
.add-btn {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 7px;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  flex: none;
}
.add-btn:hover {
  opacity: 0.9;
}

/* —— 三段式分区(统一结构) —— */
.section {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.section:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.5;
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
}
.red-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  display: inline-block;
}

/* —— 统一的条目行:时间 · 点 · 标题 —— */
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 5px 6px;
  border-radius: 6px;
}
.item.local {
  cursor: pointer;
}
.item.local:hover {
  background: var(--hover);
}
.time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
  width: 42px;
  flex: none;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--border);
}
.dot.accent {
  background: var(--accent);
}
.title {
  flex: 1;
  opacity: 0.95;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bell {
  font-size: 11px;
  opacity: 0.7;
}

.empty {
  font-size: 12px;
  opacity: 0.4;
  text-align: center;
  padding: 8px 0;
}
.hint {
  font-size: 11px;
  opacity: 0.6;
  padding: 4px 0;
  cursor: pointer;
}
.hint.muted {
  cursor: default;
  opacity: 0.4;
}

/* —— 行内编辑(我的事件) —— */
.edit-title,
.edit-time {
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
}
.edit-title {
  flex: 1;
  min-width: 80px;
}
.edit-time {
  width: 70px;
}
.edit-notify {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.85;
}
.edit-notify input {
  width: 12px;
  height: 12px;
}
.save-btn,
.cancel-btn {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.save-btn {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
