<script setup>
import { watchEffect } from "vue";
import CalendarWidget from "./components/CalendarWidget.vue";
import { useSettings } from "./composables/useSettings";
import { isIOS } from "./utils/platform";

const { settings, update } = useSettings();

// 移动端:给 <html> 打 platform-ios 标记,CSS 据此做全屏适配
if (isIOS()) document.documentElement.classList.add("platform-ios");

watchEffect(() => {
  const t = settings.value.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
});
</script>

<template>
  <div class="app">
    <CalendarWidget :settings="settings" @update-settings="update" />
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

/* ===== 移动端(iOS)全屏适配:填满视口 + 内部滚动,避免 100vh 超出产生整页滚动条 ===== */
html.platform-ios body { background: var(--surface); }
html.platform-ios,
html.platform-ios body,
html.platform-ios #app { height: 100%; margin: 0; padding: 0; overflow: hidden; }
html.platform-ios .app { height: 100%; }
/* widget 填满视口,safe-area 顶边留白,overflow:hidden 禁止整页滚动 */
html.platform-ios .widget {
  width: 100%; height: 100%; border-radius: 0;
  box-sizing: border-box; overflow: hidden;
  padding-top: env(safe-area-inset-top);
}
html.platform-ios .cw-header { padding: 14px 14px 8px; flex: none; }
html.platform-ios .month { font-size: 17px; font-weight: 700; min-width: 130px; }
html.platform-ios .icon-btn { width: 38px; height: 34px; font-size: 20px; }
html.platform-ios .icon-btn.gear { font-size: 17px; }
html.platform-ios .today-btn { font-size: 13px; padding: 6px 12px; }
html.platform-ios .dow { font-size: 12px; padding: 6px 0 8px; }
html.platform-ios .grid { gap: 3px; padding: 4px 12px 8px; flex: none; }
html.platform-ios .day-cell { padding: 8px 0; min-height: 54px; border-radius: 12px; }
html.platform-ios .day-cell .solar { font-size: 20px; }
html.platform-ios .day-cell .lunar { font-size: 11px; }
/* 事件面板:填满剩余高度 + 自身滚动,底部留 safe-area(不再底部空白) */
html.platform-ios .event-panel {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 0 14px calc(14px + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
html.platform-ios .date-line { font-size: 16px; }
html.platform-ios .meta-line { font-size: 12px; }
html.platform-ios .add-btn { font-size: 14px; padding: 7px 16px; }
html.platform-ios .section-title { font-size: 12px; }
html.platform-ios .item { font-size: 15px; padding: 9px 6px; }
html.platform-ios .time { font-size: 13px; width: 48px; }
html.platform-ios .empty { font-size: 13px; padding: 12px 0; }
/* 设置 inline 覆盖层:移动端样式(字体放大/触控友好)+ safe-area 避让 + 滚动到底 */
html.platform-ios .settings-overlay { border-radius: 0; }
html.platform-ios .settings-overlay-inner { padding-top: env(safe-area-inset-top); }
html.platform-ios .back-btn { font-size: 16px; padding: 14px 16px; }
html.platform-ios .settings-win { height: auto; flex: 1 1 0; min-height: 0; }
html.platform-ios .sw-body {
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
  gap: 16px;
}
html.platform-ios .card { padding: 6px 16px; border-radius: 14px; }
html.platform-ios .card-head { font-size: 14px; padding: 12px 0 8px; }
html.platform-ios .row { font-size: 16px; padding: 13px 0; }
html.platform-ios .lbl { font-size: 16px; }
html.platform-ios .lbl.indent { font-size: 14px; }
html.platform-ios select { font-size: 15px; padding: 8px 12px; border-radius: 10px; }
html.platform-ios input[type="checkbox"] { width: 22px; height: 22px; }
html.platform-ios .quit-btn { font-size: 16px; padding: 13px; margin-top: 16px; }
html.platform-ios .note { font-size: 13px; }
</style>
