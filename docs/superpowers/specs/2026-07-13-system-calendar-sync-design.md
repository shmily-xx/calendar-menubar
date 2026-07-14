# 系统日历同步(只读,macOS)— 设计文档

日期:2026-07-13
状态:已通过设计评审,待实现

## 目标

把 macOS 系统日历(含 iCloud / Google / Exchange / CalDAV 等订阅日历)中的事件,以**只读**方式同步到本 App,在月视图网格和当日事件面板中与本地手动事件**分区**显示。

## 范围

**包含**
- 读取系统日历事件(`EKEvent`),包括订阅日历、重复事件(展开后)。
- 按可见月范围拉取。
- 在事件面板分区只读显示;网格"有事件"圆点一并反映。
- 权限申请与拒绝态处理。
- 设置开关控制总开关。

**不包含**
- 提醒事项 App(`EKReminder`)。
- 双向编辑(创建/修改/删除系统事件)。
- 后台守护 / 推送刷新。
- iOS / 其它平台(仅 macOS;其它平台返回 unsupported)。
- 分发签名/公证细节(dev 版 ad-hoc 签名)。

## 架构(Swift CLI helper,三层)

### 第 1 层:Swift 可执行文件 `CalendarSync`

- 源码:`src-tauri/swift/main.swift`(纯 Swift,调 EventKit)。
- 入参:`--start <epoch秒> --end <epoch秒>`(UTC 秒,日期范围边界)。
- 流程:
  1. 初始化 `EKEventStore`。
  2. 请求日历完全访问权限(`requestFullAccessToEventsWithCompletion:`),用 dispatch semaphore 同步等待结果。
  3. 若拒绝/未决定 → 输出 `{"status":"denied"}` 并 `exit`。
  4. 否则 `predicateForEventsWithStartDate:endDate:calendars:`(calendars=nil 表示全部日历,含订阅),`eventsMatchingPredicate:` 取事件。
  5. 用纯映射函数 `mapEvents([EKEvent]) -> [JSON对象]` 转换。
  6. 输出 `{"status":"ok","events":[...]}`。
- **关键约束**:把"事件→JSON 的映射"抽成不依赖 store 的纯函数,便于单独测试。
- 编译:由 `beforeBuildCommand`/`beforeDevCommand` 调脚本 `scripts/build-cal-sync.sh`(`xcrun swiftc -O ...`),产物放到 `src-tauri/bin/cal-sync`(通过 `bundle.resources` 打进 .app)。

### 第 2 层:Rust 命令

- `#[tauri::command] fetch_system_events(app_handle, start: i64, end: i64) -> Result<Payload,String>`。
- 解析 helper 路径:`app_handle.path().resource_dir()` 拼 `cal-sync`。
- `std::process::Command::new(helper).args(["--start", .., "--end", ..]).output()`,读 stdout,解析 JSON,返回。
- macOS 专属(`#[cfg(target_os="macos")]`),其它平台返回 `{"status":"unsupported"}`。
- 超时保护:子进程加超时(如 10s),避免卡死。
- 注册到 `invoke_handler`。

### 第 3 层:前端组合式 `useSystemCalendar.js`

- 状态:
  - `systemEventsByDate`:ref,`{ [YYYY-MM-DD]: SystemEvent[] }`。
  - `status`:ref,`"idle" | "loading" | "ok" | "denied" | "error" | "unsupported"`。
- `fetchRange(startKey, endKey)`:调 `invoke("fetch_system_events", { start, end })`,按结果更新 status;`ok` 时调纯函数 `bucketByDate(events, 时区)` 分桶。
- **缓存覆盖语义**:每次拉取对应**整个可见网格窗口**(首格日期 00:00 本地 → 末格日期 23:59:59 本地,共约 42 天,跨相邻月)。拉取完成后用本次窗口的分桶**整体覆盖** `systemEventsByDate`(清空旧桶再写入),保证窗口与数据始终一致、相邻月溢出日不残留旧值。范围以"可见窗口"为准,而非自然月,这样网格里的上下月溢出格也能显示系统事件。
- 由 `CalendarWidget` 在切月/跨天时调用。

## 数据模型

系统事件(前端):
```ts
{
  id: string;            // EKEvent.eventIdentifier
  title: string;         // EKEvent.title
  startISO: string;      // EKEvent.startDate, ISO8601
  endISO: string;        // EKEvent.endDate, ISO8601
  allDay: boolean;       // EKEvent.allDay
  calendarTitle: string; // EKEvent.calendar.title
  calendarColor: string; // EKEvent.calendar.color (hex)
  location?: string;     // EKEvent.location
}
```

分桶规则(纯函数 `bucketByDate`):
- 非全天事件:按 `startISO` 的**本地时区**日期落入 `YYYY-MM-DD`。
- 全天事件:按起止跨越的**每一天**分别落入对应日期(含首尾)。
- 时区:统一用渲染环境的本地时区。

## 数据流

```
设置开关 ON
  → CalendarWidget 切到某月
  → useSystemCalendar.fetchRange(月起始, 月结束)
  → invoke fetch_system_events
  → Rust spawn cal-sync --start --end
  → cal-sync: 权限? 取事件? → stdout JSON
  → Rust 解析回传
  → bucketByDate 分桶 → systemEventsByDate
  → EventPanel / MonthGrid 响应式更新
```

## 展示

### 网格(MonthGrid / DayCell)
- 某天"有事件"圆点 = 本地事件存在 **或** 系统事件存在(任一即为 true)。

### 事件面板(EventPanel)分区
- 上区 **"系统日历"**(只读):每条 = `[时间] [日历色圆点] 标题`;全天事件时间位显示"全天";点击**无反应**(不进编辑态)。
- 下区 **"我的事件"**(现有可编辑列表):保持现状。
- 两区各自独立滚动。窗口/面板高度视情微调以容纳两区。
- 状态行:
  - `denied`:系统日历区显示"未授权访问日历 → 前往系统设置",点击用 opener 打开 `x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars`。
  - `loading`:显示"同步中…";`error`:显示"同步失败";`unsupported`:该区隐藏或提示"仅 macOS 支持"。

## 权限

- `tauri.conf.json` → `bundle.macOS.infoPlist` 增加:
  - `NSCalendarsUsageDescription = "用于在日历中显示你的系统日历事件(只读)。"`
- App 未沙盒 → 无需 entitlement。
- TCC 归属:子进程 helper 由主 App 拉起,理论上权限归属主 App 签名身份。**spike 必须验证**:弹窗归属是否为主 App、授权是否持久、helper 是否需与主 App 同签名。

## 设置

- 新增开关 **"同步系统日历"**,默认 **关**(避免首启莫名弹权限)。
- 关闭开关时:不拉取、清空 `systemEventsByDate`、EventPanel 隐藏系统日历区。
- 打开开关:首次触发权限申请 → 拉取当前可见月。
- 字段:`settings.syncSystemCalendar`(boolean,默认 false),纳入 `normalizeSettings`。

## 刷新策略

- 触发拉取:① 切月(`year`/`month` 变化)② 跨天滚动(复用 `CalendarWidget.checkDayRollover`)。
- **不在每次聚焦面板时重拉**(避免频繁起进程)。
- 按月缓存;切月/跨天覆盖重拉。
- 开关关闭 → 立即清空缓存。

## 测试策略

- **前端纯函数 `bucketByDate(events, 时区)`**:单元测试,覆盖普通事件、全天单日、全天跨日、跨月。主可测逻辑。
- **Rust JSON 解析 + helper 路径拼接**:抽纯函数,喂数据 JSON 测试(不依赖真实进程)。
- **Swift 映射函数 `mapEvents`**:Swift 测试目标,用构造的 `EKEvent` 验证字段映射(不依赖真实 store/权限)。
- **真实 EventKit 访问**:spike + 本机手动验证(CI 无法可靠测 TCC 权限)。

## 风险与缓解

1. **TCC 权限归属(最高风险)**:spike 先验证。若 helper 子进程归属不对,补救方案:改由主进程触发权限请求,或评估换 dylib 方案。
2. **Swift 工具链**:构建机需 `xcrun swiftc`(Tauri 本就需 Xcode CLT)。终端用户不需要(已预编译进 bundle)。
3. **签名/公证**:正式分发需同签名;当前 dev 版 ad-hoc,先不处理。
4. **性能**:每次切月起一次进程(~数十 ms),可接受。
5. **大量事件/超长重复事件**:按可见月范围拉取天然限制;子进程加超时。

## Spike 计划(先去风险,再铺开)

1. 写最小 `main.swift`:init store + 请求权限 + 取 30 天事件 + 打印 1 条 JSON。
2. `swiftc` 编译,命令行直接跑,确认能弹权限、能读到事件。
3. 把它塞进 .app bundle,用主 App spawn 它,确认权限弹窗归属主 App、授权持久。
4. spike 全绿 → 进入完整实现计划。
5. (spike 顺便确认)`resource_dir()` 在 `tauri dev` 与 `tauri build` 下解析到的 helper 路径是否一致;若 dev 下资源路径不同,在 Rust 侧做 dev/prod 兜底。

## 后续可选项(不在本期)

- 按日历单独勾选(部分订阅日历)。
- 系统事件点击弹详情(只读)。
- 双向编辑。
- 提醒事项接入。
- 后台周期刷新。
