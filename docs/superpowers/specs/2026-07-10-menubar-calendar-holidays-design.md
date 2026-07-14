# 菜单栏日历 + 国内节假日 设计文档（子项目）

- 日期：2026-07-10
- 项目：`日历`（原 `taurifirst`，Tauri 2 + Vue 3 + Vite，上一子项目已完成"无边框置顶小窗 + 农历/事件/通知"）
- 目标平台：macOS（当前开发机 darwin）
- 状态：已与用户确认设计，待生成实现计划
- 范围：本子项目覆盖 **① 应用改为菜单栏配件 + 弹窗 ② 国内节假日 ③ 设置项**。**不含**：系统日历事件 / 提醒事项读取（独立子项目，已推迟）。

## 1. 目标

把现有的"独立置顶小窗"改造成 **macOS 菜单栏日历**：应用只住在状态栏，点图标弹出当前日历小框，点外部收起；并接入 **国内法定节假日 / 调休 / 补班**数据，网格与底部做相应标记；新增轻量**设置**。

## 2. 非目标（YAGNI / 推迟）

- 系统**日历事件 / 提醒事项**读取（含"从系统日历读节假日订阅"）→ 独立子项目，届时单开 spec。
- 多地区节假日、自定义主题色、周数显示、开机自启 → 未来扩展。
- Windows / Linux 专门适配（托盘行为以 macOS 为准）。

## 3. 运行形态与窗口

### 3.1 菜单栏配件
- Rust 启动调用 `app.set_activation_policy(tauri::ActivationPolicy::Accessory)` → 无 Dock 图标、不抢占前台。
- 主窗口改为**无边框圆角弹窗**，启动隐藏：
  - `decorations:false`、`transparent:true`、`resizable:false`、`visible:false`、`skipTaskbar:true`、`alwaysOnTop:true`、`acceptFirstMouse:true`、`shadow`（由透明窗口 + 内层圆角卡片 + CSS box-shadow 呈现浮起感）。
- 现有日历内容（公历/农历/事件/节日/节气）整体搬进弹窗；头部按**无边框卡片**重排：去掉 `titleBarStyle: Overlay`、去掉红黄绿留白（`padding-left:78px`）与拖动逻辑——弹窗锚定在状态栏下，不需要拖动。

### 3.2 托盘与弹窗交互
- 托盘图标由 JS 创建（`@tauri-apps/api/tray` 的 `TrayIcon`），**左键切换显隐**。
- 显示流程：取托盘点击事件给的 rect/position → 结合当前显示器与缩放因子 → 把弹窗定位到图标**正下方、靠右上角** → 按屏幕边界 clamp → `show()` + `setFocus()`。
- 收起：弹窗失焦（`onFocusChanged` 失焦）→ `hide()`；按 Esc → `hide()`；再次点托盘 → `hide()`。

## 4. 状态栏图标（可配置）

- 设置项 `trayIconMode`：`icon`（单色日历图标）/ `date`（今日公历数字，如 `10`）/ `lunar`（今日农历，如 `十五`）。
- **渲染**：离屏 `<canvas>` 画出对应内容 → `getImageData` 取 RGBA → `@tauri-apps/api/image` 的 `Image.fromRgbaPixels(bytes, w, h)` → `tray.setIcon(image)`，并 `tray.setIconAsTemplate(true)`（macOS 随菜单栏明暗自动反色）。
  - `icon` 模式：单色日历 glyph（模板图）。
  - `date` 模式：加粗公历数字。
  - `lunar` 模式：今日农历日中文（`lunar.getDayInChinese()`，如 `十五`；初/十/廿也照原样）。
- **重绘时机**：设置改变时；跨日时（挂一个每日定时器，到次日 0 点刷新）；弹窗每次显示时顺手校验一次。
- 模板图随包放在 `src-tauri/icons/tray-template.png`（黑色+透明，约 22×22 @1x / 44 @2x）。

## 5. 设置项

- 存储：`localStorage` 键 `calendar:settings`，结构与默认值：
  ```js
  {
    trayIconMode: "date",     // "icon" | "date" | "lunar"
    weekStart: 1,             // 1=周一, 0=周日
    theme: "auto",            // "auto" | "light" | "dark"
    showLunar: true,
    showHolidays: true
  }
  ```
- UI：弹窗头部加齿轮按钮 → 打开 `SettingsPanel.vue`（浮层或切换视图）：
  - 托盘图标模式（三个单选）
  - 每周起始日（周一 / 周日）
  - 外观（跟随系统 / 浅色 / 深色）
  - 显示农历（开关）
  - 显示节假日（开关）
- `theme`：`auto` 时沿用 `prefers-color-scheme`；`light`/`dark` 时给 `<html>` 加 `data-theme` 强制覆盖。
- `weekStart` 改变 `buildMonthMatrix` 的星期起始与 `MonthGrid` 表头。
- `showLunar` 关闭时 DayCell 不渲染农历行（节日/节气行也一并隐藏）。
- `showHolidays` 关闭时不渲染节假日标记与"距下次放假"行。

## 6. 国内节假日

- **数据源**：[`NateScarlet/holiday-cn`](https://github.com/NateScarlet/holiday-cn)，每年一份 JSON（国务院公告，CI 自动更新）。raw 地址形如 `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/<year>.json`。
- **策略**：
  - 构建时把**当年 + 次年** JSON 复制到 `src/holidays/`（如 `2026.json`、`2027.json`），随包内置，保证**离线可用**。
  - 启动时若联网且本地缓存 > 7 天，best-effort 从 raw 拉最新 `<year>.json` 写入缓存目录；失败静默，绝不阻塞或报错。
- **数据形态**：解析为 `Map<YYYY-MM-DD, { holiday: boolean, name?: string }>`。`holiday:true` = 放假（带名）；当天是周末但 `holiday:false` = **补班**。
- **展示**：
  - 网格：放假日 → DayCell 农历行优先显示节假日名（如"春节"）；补班的周末日 → 橙色"班"角标。
  - 底部新增一行（`showHolidays` 开启时）：`距下次放假：X 天 → <节假日名>`（基于今日往后第一个 `holiday:true` 计算）。
- **composable**：`useHolidays()` 暴露 `isHoliday(key)`、`isWorkday(key)`（补班判定）、`nextHolidayFrom(key)`、`holidayLabel(key)`，内部负责加载内置 + 联网更新 + 缓存。

## 7. 文件结构

**新增（前端）：**
- `src/composables/useSettings.js` — 偏好读写（纯函数 `loadSettings/saveSettings` + 响应式 composable）。
- `src/composables/useTray.js` — 托盘创建、点击显隐、窗口定位。
- `src/composables/useHolidays.js` — 节假日数据加载/缓存/查询。
- `src/utils/renderTrayIcon.js` — canvas → `Image`（按 mode 出图，纯函数返回 RGBA）。
- `src/components/SettingsPanel.vue` — 设置浮层。
- `src/holidays/2026.json`、`2027.json` — 内置节假日数据。

**修改：**
- `src-tauri/src/lib.rs` — 仅加 `set_activation_policy(Accessory)`（隐藏 Dock）。托盘在 JS 端创建（见 `useTray.js`）。
- `src-tauri/tauri.conf.json` — 主窗口改无边框隐藏（见 §3.1）。
- `src-tauri/capabilities/default.json` — 增加托盘与窗口权限（见 §8）。
- `src/App.vue` / `src/components/CalendarWidget.vue` — 无边框头部、齿轮入口、设置接入、节假日标记、底部"距下次放假"行；按 `weekStart`/`theme`/`showLunar`/`showHolidays` 响应。
- `src/components/DayCell.vue` — 放假名 / 补班"班"角标；`showLunar` 关闭时隐藏农历行。
- `src/components/MonthGrid.vue` — 表头按 `weekStart`（周一/周日）。
- `src/composables/useCalendar.js` — `buildMonthMatrix` / 表头按 `weekStart` 可配。

## 8. 权限 / 能力

capabilities（JS 主导方案，最终清单在实现计划里 pin）：
- 托盘：`core:tray:default`（或 `core:tray:allow-new` + `allow-set-icon` + `allow-set-icon-as-template` + `allow-set-tooltip`）。
- 窗口：`core:window:allow-show`、`core:window:allow-hide`、`core:window:allow-set-position`、`core:window:allow-set-focus`、`core:window:allow-current-monitor`、`core:window:allow-inner-size`、`core:window:allow-outer-size`、`core:window:allow-is-visible`。
- 既有：`core:default`、`opener:default`、`notification:default`、`core:window:allow-start-dragging`（弹窗不拖动，但保留无妨）。
- 联网：CSP 当前为 `null`，webview `fetch` raw 可用，无需额外配置。

## 9. 测试

- **单元（Vitest）**：
  - `useHolidays`：用内置 `2026.json` 断言某已知放假日 `isHoliday` 为真且 `holidayLabel` 正确；某已知补班周末 `isWorkday` 为真；`nextHolidayFrom` 计算距下次放假天数正确。
  - `useSettings`：默认值、读写覆盖、损坏回退默认。
  - `renderTrayIcon`：各 mode 出图返回正确尺寸的 RGBA、非空。
  - `useCalendar`（增量）：`weekStart=0` 时矩阵首列周日、表头顺序变化。
- **组件**：`SettingsPanel` 渲染各选项并 emit 变更；`DayCell` 放假/补班/关农历各态。
- **手动**：托盘点击显隐 + 定位靠右上角；三种图标模式切换与跨日刷新；放假/补班标记；断网仍显示节假日；失焦/Esc 收起；外观三档；周一/周日切换。

## 10. 风险与备注

- **托盘定位坐标**：physical vs logical 坐标 + Retina 缩放因子需谨慎；实现时用 `currentMonitor().scaleFactor` 换算，并 clamp 到屏幕工作区。
- **模板图标反色**：`setIconAsTemplate(true)` 在 macOS 生效；`icon` 模式的模板图必须是单色+透明才能正确反色。
- **canvas 在 webview 出图**：需 webview 支持（WKWebView 支持），无障碍性不追求。
- **联网更新可靠性**：raw.githubusercontent.com 偶发不稳定；失败必须静默降级到内置 JSON，不影响主流程。
- **accessory 模式 + 通知**：Accessory 应用仍可发通知（上一子项目的通知逻辑保留）。
- 项目非 git 仓库：spec 写入但不 commit。
- 具体 Tauri v2 JS API（`TrayIcon`、`Image.fromRgbaPixels`、窗口定位方法名、所需权限清单）在 **writing-plans** 阶段 pin 到精确签名，再落代码。
```
