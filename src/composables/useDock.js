import { watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

// 同步设置中的 dockVisible 到原生应用（macOS Dock 图标显隐）。
// 启动时应用一次，之后随设置变化即时更新。非 macOS / 非 Tauri 环境静默忽略。
export function useDock(settingsRef) {
  async function apply(visible) {
    try {
      await invoke("set_dock_visible", { visible });
    } catch {
      // 非 Tauri 环境（如 vitest）：忽略
    }
  }
  apply(settingsRef.value.dockVisible);
  watch(() => settingsRef.value.dockVisible, (v) => apply(v));
}
