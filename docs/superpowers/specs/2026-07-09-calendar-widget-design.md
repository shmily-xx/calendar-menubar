# 日历挂件（Calendar Widget）设计文档

- 日期：2026-07-09
- 项目：`taurifirst`（Tauri 2 + Vue 3 + Vite）
- 目标平台：macOS（当前开发机为 darwin）
- 状态：已与用户确认设计，待生成实现计划

## 1. 目标与范围

把当前 Tauri + Vue 模板（问候语 demo）替换成一个**桌面日历挂件**，具备：

- 月历网格视图，可切换月份，高亮今天，可选中某天。
- 每个日期格显示**公历 + 农历**，并标注**节日 / 节气**。
- 给某天添加 / 查看 / 删除**事件**（标题 + 时间 + 是否提醒），本地持久化。
- 事件到点时弹**系统通知**（仅在应用打开时生效）。
- 窗口为 macOS 原生红黄绿按钮的小型置顶挂件。

## 2. 非目标（YAGNI）

- 不做后台 / 系统级定时提醒（仅应用打开时触发）。
- 不做"全天事件"概念；每个事件都带时间。
- 不做跨设备同步、账号、多日历。
- 不做 Windows / Linux 的专门适配（titleBarStyle 仅 macOS 生效，其他平台退化为普通窗口，可接受）。

## 3. 窗口与标题栏

修改 `src-tauri/tauri.conf.json` 中的窗口配置：

```json
{
  "title": "日历",
  "width": 360,
  "height": 460,
  "resizable": false,
  "alwaysOnTop": true,
  "hiddenTitle": true,
  "titleBarStyle": "Overlay"
}
```

- 保留默认 `decorations: true`。`titleBarStyle: "Overlay"`（macOS）保留左上角**原生红黄绿按钮**（关闭 / 最小化 / 缩放，原生可用），同时隐藏标题栏文字，内容延伸到标题栏区域。
- `hiddenTitle: true` 隐藏标题文字。
- `alwaysOnTop: true` 让挂件浮在最前。
- **布局约束**：因 traffic lights 占据左上角约 70×28px，前端头部需预留 `padding-left ≈ 78px`、`padding-top ≈ 12px`，使"日历 ‹ ›"导航不与按钮重叠。
- 无需自绘关闭按钮、无需手写关闭逻辑（系统红黄绿原生处理）。
- 仍需在 `capabilities/default.json` 增加**通知权限**（见 §7）。

## 4. 应用图标重新设计

- 设计一个**日历主题 SVG**：极简日历页 + 右上一个标记点，呼应"日历/记事"语义；扁平风格、单色或双色、小尺寸下可辨识。
- 生成流程：
  1. 写 SVG 源文件。
  2. 用 Node（`sharp` 或 `@resvg/resvg-js`）将 SVG 光栅化为 **1024×1024 PNG**。
  3. 跑 `npm run tauri icon <1024.png>` 一键产出全部平台图标，覆盖 `src-tauri/icons/`（`32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`）。
- 同时替换网页 favicon：把新 SVG 放进 `public/`，`index.html` 把 `/vite.svg` 改为新图标；挂件头部展示同款小 logo。

## 5. 组件结构（Vue 3 `<script setup>` + Composition API）

```
App.vue                      // 挂件外壳：头部(logo+导航+回今天) + 卡片容器
└─ CalendarWidget.vue        // 状态：当前年月、选中日；组装 MonthGrid + EventPanel
   ├─ MonthGrid.vue          // 星期表头 + 6×7 日期矩阵
   │  └─ DayCell.vue         // 公历 + 农历小字 + 节日/节气徽标 + 事件圆点；今天/选中态
   └─ EventPanel.vue         // 选中日事件列表：新增(标题+时间+是否提醒) / 删除

composables/
├─ useCalendar.js   // 纯日期工具：构建月矩阵、上下月、回今天；封装 lunar-javascript 取农历/节日/节气
├─ useEvents.js     // localStorage 增删改查 + 响应式事件集合
└─ useReminders.js  // 启动一次 + 每 60s 检查今日待提醒事件，到点弹通知
```

职责边界：每个组件 / composable 单一职责，通过 props / emit / composable 返回值通信，可独立理解与测试。

### 头部布局（CalendarWidget 顶部，受 §3 约束）

```
● ● ●          [logo] 日历  ‹ ›        ← 右侧避开 traffic lights
─────────────────────────────────
        2026年 7月          [回今天]
一 二 三 四 五 六 日
```

## 6. 数据模型与持久化

- 存储：`localStorage`，键 `calendar:events`。
- 结构：以 `YYYY-MM-DD` 为键的对象，值为事件数组。

```js
{
  "2026-07-09": [
    { "id": "uuid", "title": "开会", "time": "09:30", "notify": true }
  ]
}
```

- 读取用 `try/catch` + `JSON.parse`，损坏 / 缺失回退 `{}`。
- 字段：`id`（uuid）、`title`（必填）、`time`（**必填**，`HH:MM`，24 小时制）、`notify`（bool，是否到点提醒）。用户已明确不需要"全天/无时间"事件，故 `time` 必填。

## 7. 农历、节日、节气

- 依赖：`lunar-javascript`（npm）。
- 用法：`Solar.fromYmd(y, m, d).getLunar()` 一次取到：
  - 农历中文日（如 "六月十五"），月初可能为"初一"；
  - 节日：`lunar.getFestivals()`（农历节日，如春节、中秋）、`solar.getFestivals()`（公历节日，如元旦、劳动节）；
  - 节气：`lunar.getJieQi()`（当日为节气时返回名称，如"立春"、"谷雨"）。
- DayCell 显示优先级：**节日 > 节气 > 农历日**（有节日则显节日名，否则节气，否则农历日）。

## 8. 系统通知（仅应用打开时）

- 依赖：`@tauri-apps/plugin-notification`。
- Rust 端：`src-tauri/src/lib.rs` 注册 `.plugin(tauri_plugin_notification::init())`。
- capabilities：`src-tauri/capabilities/default.json` 增加 `"notification:default"`（单数；经 `cargo check` 校验）。
- 触发逻辑（纯前端 `useReminders.js`）：
  - 应用挂载时记录 `sessionStart = 当前 HH:MM`，并立即检查一次，之后 `setInterval(check, 60_000)`。
  - 检查：取今日所有 `notify === true` 的事件，对每个事件，当 `eventTime` 落在 `[sessionStart, 当前 HH:MM]` 区间内、且该 id 本次会话尚未弹过（已弹 id 存内存 Set）时触发。
  - **语义**：只有"应用打开期间到达提醒时间"的事件会弹；打开时已过点的事件**不**补弹，避免打开即一堆过期通知。
  - 触发则 `sendNotification({ title: "日历提醒", body: `${title} · ${time}` })`，并把 id 加入已弹集合。
- 权限被拒时静默降级（事件仍以圆点形式在挂件内可见）。

## 9. 样式

- 复用模板已有的 `prefers-color-scheme` 深浅色适配。
- 紧凑排版（挂件尺寸有限）；今天用强调色高亮，选中日用底色。
- 头部导航区与日期网格、事件面板视觉分层。
- 圆点 / 徽标用低饱和色，避免农历小字喧宾夺主。

## 10. 测试

- **单元测试（Vitest）**——`useCalendar` 纯函数：
  - 月矩阵正确性（首日星期对齐、6×7 结构、跨月边界）；
  - 已知日期的农历 / 节日断言（例如断言某指定公历日对应农历节日名、某日为某节气）；
  - 上 / 下月切换、回今天。
- **组件测试（@vue/test-utils）**——DayCell 在"今天 / 选中 / 有事件 / 有节日 / 有节气"各态下渲染正确。
- **手动验证**：
  - 原生红黄绿按钮可用、窗口可拖动、`alwaysOnTop` 生效；
  - 上下月切换、回今天；
  - 新增 / 删除事件，刷新后持久化；
  - 通知授权弹窗 + 到点弹通知；
  - 应用图标与 favicon 已替换。

## 11. 风险与备注

- **lunar-javascript 的 ESM 接入**：Vite 下可直接 `import { Solar } from 'lunar-javascript'`；若遇 CJS 互操作告警，按 Vite 提示处理。
- **通知权限**：macOS 首次需授权；若用户拒绝，提醒降级为挂件内圆点提示。
- **图标光栅化**：实现时确认本机是否有 `rsvg-convert` / ImageMagick；没有则用 Node 库（`sharp` / `@resvg/resvg-js`）光栅化 SVG。
- 项目当前非 git 仓库，spec 文档写入但不执行 git commit。
```
