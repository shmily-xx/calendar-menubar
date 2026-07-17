<script setup>
import { invoke } from "@tauri-apps/api/core";

const props = defineProps({
  settings: { type: Object, required: true },
});
const emit = defineEmits(["update"]);

function set(field, value) {
  emit("update", { [field]: value });
}
async function quitApp() {
  try {
    await invoke("quit_app");
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div class="settings-win">
    <div class="sw-body">
      <!-- ① 日历显示 -->
      <section class="card">
        <div class="card-head">日历显示</div>
        <div class="row">
          <span class="lbl">每周起始</span>
          <select :value="String(settings.weekStart)" @change="set('weekStart', Number($event.target.value))">
            <option value="1">周一</option>
            <option value="0">周日</option>
          </select>
        </div>
        <div class="row">
          <span class="lbl">外观</span>
          <select :value="settings.theme" @change="set('theme', $event.target.value)">
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div class="row switch">
          <span class="lbl">显示农历</span>
          <input type="checkbox" :checked="settings.showLunar" @change="set('showLunar', $event.target.checked)" />
        </div>
        <div class="row switch">
          <span class="lbl">显示节假日(休/班)</span>
          <input type="checkbox" :checked="settings.showHolidays" @change="set('showHolidays', $event.target.checked)" />
        </div>
      </section>

      <!-- ② 同步 -->
      <section class="card">
        <div class="card-head">同步与隐私</div>
        <div class="row switch">
          <span class="lbl">同步系统日历与提醒事项</span>
          <input type="checkbox" :checked="settings.syncSystemCalendar" @change="set('syncSystemCalendar', $event.target.checked)" />
        </div>
        <div class="row switch" :class="{ disabled: !settings.syncSystemCalendar }">
          <span class="lbl">显示提醒事项模块</span>
          <input type="checkbox" :checked="settings.showReminders" :disabled="!settings.syncSystemCalendar" @change="set('showReminders', $event.target.checked)" />
        </div>
        <div class="row switch" :class="{ disabled: !settings.syncSystemCalendar || !settings.showReminders }">
          <span class="lbl indent">无提醒时显示模块</span>
          <input type="checkbox" :checked="settings.remindersShowEmpty" :disabled="!settings.syncSystemCalendar || !settings.showReminders" @change="set('remindersShowEmpty', $event.target.checked)" />
        </div>
        <div class="row switch" :class="{ disabled: !settings.syncSystemCalendar }">
          <span class="lbl">显示系统日历模块</span>
          <input type="checkbox" :checked="settings.showSystemCalendar" :disabled="!settings.syncSystemCalendar" @change="set('showSystemCalendar', $event.target.checked)" />
        </div>
        <div class="row switch" :class="{ disabled: !settings.syncSystemCalendar || !settings.showSystemCalendar }">
          <span class="lbl indent">无事件时显示模块</span>
          <input type="checkbox" :checked="settings.systemCalendarShowEmpty" :disabled="!settings.syncSystemCalendar || !settings.showSystemCalendar" @change="set('systemCalendarShowEmpty', $event.target.checked)" />
        </div>
        <div class="row switch">
          <span class="lbl">显示我的事件模块</span>
          <input type="checkbox" :checked="settings.showMyEvents" @change="set('showMyEvents', $event.target.checked)" />
        </div>
        <div class="row switch" :class="{ disabled: !settings.showMyEvents }">
          <span class="lbl indent">无事件时显示模块</span>
          <input type="checkbox" :checked="settings.myEventsShowEmpty" :disabled="!settings.showMyEvents" @change="set('myEventsShowEmpty', $event.target.checked)" />
        </div>
        <p class="note">仅读取本机日历与提醒事项用于展示,不会上传或写回。授权后在日历下方分区显示。</p>
      </section>

      <!-- ③ 应用 -->
      <section class="card">
        <div class="card-head">应用</div>
        <button class="quit-btn" @click="quitApp">退出 weid</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-win {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface);
  color: var(--text);
}
.sw-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card {
  background: var(--surface-2);
  border-radius: 12px;
  padding: 6px 14px;
}
.card-head {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.4px;
  padding: 10px 0 6px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  padding: 9px 0;
  border-top: 1px solid var(--border);
}
.row:first-of-type { border-top: none; }
.row.switch { cursor: pointer; }
.lbl { opacity: 0.88; }
.lbl.indent { padding-left: 20px; font-size: 12px; opacity: 0.75; }
.row.disabled { opacity: 0.4; pointer-events: none; }

select {
  font-family: inherit;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }

.note {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.55;
  margin: 8px 0 4px;
}

.quit-btn {
  margin: 10px 0 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.quit-btn:hover { background: var(--hover); }
</style>
