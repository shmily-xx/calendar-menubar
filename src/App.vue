<script setup>
import { watchEffect } from "vue";
import CalendarWidget from "./components/CalendarWidget.vue";
import SettingsWindow from "./components/SettingsWindow.vue";
import { useSettings } from "./composables/useSettings";
import { useTray } from "./composables/useTray";
import { useDock } from "./composables/useDock";

const { settings, update } = useSettings();

// 设置以独立窗口打开(?view=settings),只渲染设置面板;主窗口才挂托盘/Dock。
const isSettingsView =
  new URLSearchParams(window.location.search).get("view") === "settings";

watchEffect(() => {
  const t = settings.value.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
});

if (!isSettingsView) {
  useTray(settings);
  useDock(settings);
}
</script>

<template>
  <div class="app" :class="{ 'settings-app': isSettingsView }">
    <SettingsWindow v-if="isSettingsView" :settings="settings" @update="update" />
    <CalendarWidget v-else :settings="settings" @update-settings="update" />
  </div>
</template>

<style>
:root {
  --text: #1f2937;
  --surface: #ffffff;
  --surface-2: #f7f7f9;
  --border: rgba(127, 127, 127, 0.3);
  --hover: rgba(127, 127, 127, 0.12);
  --accent: #2563eb;
  --accent-soft: rgba(37, 99, 235, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Inter, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --text: #e5e7eb;
    --surface: #1f1f24;
    --surface-2: #2a2a31;
    --border: rgba(255, 255, 255, 0.18);
    --hover: rgba(255, 255, 255, 0.1);
    --accent: #3b82f6;
    --accent-soft: rgba(59, 130, 246, 0.2);
  }
}
:root[data-theme="dark"] {
  --text: #e5e7eb;
  --surface: #1f1f24;
  --surface-2: #2a2a31;
  --border: rgba(255, 255, 255, 0.18);
  --hover: rgba(255, 255, 255, 0.1);
  --accent: #3b82f6;
  --accent-soft: rgba(59, 130, 246, 0.2);
}
html, body, #app { margin: 0; padding: 0; background: transparent; }
body { background-color: transparent; }
.app { min-height: 100vh; }
.app.settings-app { height: 100vh; background: var(--surface); }
</style>
