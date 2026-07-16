import { onUnmounted, watch } from "vue";
import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu } from "@tauri-apps/api/menu";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { renderTrayIcon } from "../utils/trayIcon";
import { getDayInfo, todayParts, toKey } from "./useCalendar";
import { useHolidays, nextHolidayFrom } from "./useHolidays";

const TRAY_ID = "calendar";

export function useTray(settingsRef) {
  let tray = null;
  let unlistenFocus = null;
  let unlistenDock = null;
  let dayTimer = null;
  let hideTimer = null;
  let lastToggle = 0;
  const { data: holidays, refresh: refreshHolidays } = useHolidays();

  async function updateIcon() {
    if (!tray) return;
    try {
      const t = todayParts();
      const di = getDayInfo(t.year, t.month, t.day);
      const nextHoliday = nextHolidayFrom(holidays.value, toKey(t.year, t.month, t.day));
      const trayInfo = {
        solarMonth: t.month,
        solarDay: t.day,
        lunarMonth: di.lunarMonth,
        lunarDay: di.lunarDay,
        weekday: di.weekday,
        nextHoliday,
      };
      const img = await renderTrayIcon(settingsRef.value.tray, trayInfo);
      await tray.setIcon(img);
      await tray.setIconAsTemplate(true);
    } catch (e) {
      console.error("[useTray] updateIcon failed", e);
    }
  }

  async function showAt(x, y) {
    const w = getCurrentWindow();
    try {
      await w.setPosition(new PhysicalPosition(x, y));
    } catch (e) {
      /* setPosition failed, fall through to show */
    }
    await w.show();
    await w.setFocus();
    window.dispatchEvent(new CustomEvent("tray-window-shown"));
  }

  // 用点击事件里拿到的托盘图标位置，把弹窗定位到图标正下方、右对齐
  async function positionAndShowUnder(rect) {
    const w = getCurrentWindow();
    let winSize = null;
    try {
      winSize = await w.outerSize();
    } catch (e) {
      await w.show();
      return;
    }
    const iconRight = rect.position.x + rect.size.width;
    const iconBottom = rect.position.y + rect.size.height;
    let x = iconRight - winSize.width;
    let y = iconBottom + 4;
    try {
      const mon = await primaryMonitor();
      if (mon) {
        const minX = mon.position.x + 4;
        if (x < minX) x = minX;
      }
    } catch (e) {
      /* primaryMonitor 失败就用计算值 */
    }
    await showAt(x, y);
  }

  // Dock 图标点击：定位到主屏右上角
  async function positionAndShowTopRight() {
    const w = getCurrentWindow();
    let winSize = null;
    try {
      winSize = await w.outerSize();
    } catch (e) {
      await w.show();
      window.dispatchEvent(new CustomEvent("tray-window-shown"));
      return;
    }
    try {
      const mon = await primaryMonitor();
      if (mon && winSize) {
        const x = mon.position.x + mon.size.width - winSize.width - 8;
        const y = mon.position.y + 8;
        await showAt(x, y);
        return;
      }
    } catch (e) {
      /* ignore */
    }
    await w.show();
    window.dispatchEvent(new CustomEvent("tray-window-shown"));
  }

  // 失焦延迟隐藏（点别处收起）；可被托盘点击取消
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(async () => {
      try {
        await getCurrentWindow().hide();
      } catch (e) {
        /* ignore */
      }
    }, 150);
  }
  function cancelHide() {
    clearTimeout(hideTimer);
  }

  async function onTrayEvent(event) {
    // 左键切换显隐；右键交给原生菜单（退出）
    if (event.type !== "Click" || event.button !== "Left") return;
    // macOS 的 Click 会同时触发按下和松开两次，去抖确保每次物理点击只切换一次
    const now = Date.now();
    if (now - lastToggle < 300) return;
    lastToggle = now;

    cancelHide();
    updateIcon(); // refresh in case the day rolled over while the window was hidden/asleep
    const w = getCurrentWindow();
    try {
      if (await w.isVisible()) {
        await w.hide();
      } else {
        await positionAndShowUnder(event.rect);
      }
    } catch (e) {
      console.error("[useTray] toggle failed", e);
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      cancelHide();
      getCurrentWindow().hide().catch(() => {});
    }
  }

  async function init() {
    try {
      // 右键菜单：退出
      const menu = await Menu.new({
        items: [
          {
            id: "quit",
            text: "退出",
            action: async () => {
              await invoke("quit_app");
            },
          },
        ],
      });

      tray = await TrayIcon.new({
        id: TRAY_ID,
        tooltip: "weid",
        iconAsTemplate: true,
        menu,
        showMenuOnLeftClick: false, // 左键不弹菜单，交给 action 切换；右键弹菜单
        action: onTrayEvent,
      });
      await updateIcon();
      refreshHolidays(); // 刷新节假日数据（用于放假倒计时）

      // 失焦（点别处）→ 延迟收起；获得焦点 → 取消收起
      unlistenFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) cancelHide();
        else scheduleHide();
      });

      // Dock 图标点击重新打开应用 → 显示弹窗
      unlistenDock = await listen("dock-clicked", async () => {
        cancelHide();
        updateIcon(); // refresh after potential sleep/rollover
        const w = getCurrentWindow();
        if (!(await w.isVisible())) {
          await positionAndShowTopRight();
        }
      });

      window.addEventListener("keydown", onKeydown);
      watch(() => settingsRef.value.tray, updateIcon, { deep: true });
      dayTimer = setInterval(updateIcon, 60 * 1000);
    } catch (e) {
      console.error("[useTray] init failed", e);
    }
  }

  init();

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    if (unlistenFocus) unlistenFocus();
    if (unlistenDock) unlistenDock();
    if (dayTimer) clearInterval(dayTimer);
    clearTimeout(hideTimer);
  });
}
