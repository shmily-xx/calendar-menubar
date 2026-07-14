# 系统日历同步(只读) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 macOS 系统日历(含订阅日历)的事件以只读方式同步到本 App,在月视图网格与事件面板中分区显示。

**Architecture:** 三层 —— Swift CLI helper(`cal-sync`,调 EventKit 取事件,输出 JSON)→ Rust 命令(spawn helper、解析 JSON、回传)→ 前端 composable(按可见窗口拉取、按本地时区分桶、驱动 UI 分区显示)。设置开关门控,默认关。

**Tech Stack:** Swift + EventKit, Rust + serde_json, Vue 3 composables, Vitest。

> **本项目无 git**("Is a git repository: false")。计划中的"提交"步骤替换为运行完整测试套件作为检查点:`npm test`。

> **最高风险检查点**:TCC 权限归属。Task 3 先在终端直接跑 helper 验证"能编译/弹权限/出 JSON";Task 5 之后再做一次"主 App 内 spawn 是否归属主 App"的手动验证。若归属不对,**停下来**重新评估(改 dylib 或改由主进程请求权限),不要继续铺 UI。

参考 spec:`docs/superpowers/specs/2026-07-13-system-calendar-sync-design.md`

---

## File Structure

**新建:**
- `src/utils/systemCalendar.js` — 纯函数:`bucketByDate(events)`、`epochStartOfDay/epochEndOfDay`、`localDateKey`。最可测的核心逻辑。
- `src/tests/systemCalendar.test.js` — 上述纯函数的单元测试。
- `src/composables/useSystemCalendar.js` — 组合式:状态(`systemEventsByDate`/`status`)、`fetchRange`、`clear`。
- `src-tauri/swift/main.swift` — helper 入口:解析参数、初始化 store、请求权限、取事件、emit JSON。
- `src-tauri/swift/Mapping.swift` — 纯映射 `mapEvents([EKEvent]) -> [CalEvent]`、`colorToHex`、Codable 结构。
- `scripts/build-cal-sync.sh` — 用 `xcrun swiftc` 编译 helper 到 `src-tauri/bin/cal-sync`。
- `src/tests/useSystemCalendar.test.js` — composable 的纯逻辑测试(bucket 调用与状态机)。

**修改:**
- `src/composables/useSettings.js` — 新增 `syncSystemCalendar: false` 默认 + normalize。
- `src/tests/useSettings.test.js` — 新字段测试。
- `src-tauri/Cargo.toml` — 加 `serde`、`serde_json` 依赖。
- `src-tauri/src/lib.rs` — `fetch_system_events` 命令 + `parse_payload` 纯函数。
- `src-tauri/tauri.conf.json` — `bundle.macOS.infoPlist`(NSCalendarsUsageDescription)、`bundle.resources`(`bin/cal-sync`)、`beforeDevCommand`/`beforeBuildCommand` 先编 Swift。
- `package.json` — 加 `build:swift` 脚本。
- `src/components/CalendarWidget.vue` — 接入 `useSystemCalendar`,切月/跨天拉取,网格圆点,传给 EventPanel。
- `src/components/EventPanel.vue` — 分两区:系统日历(只读)+ 我的事件;状态行。
- `src/components/SettingsPanel.vue` — "同步系统日历" 开关。

---

## Task 1: 纯函数 `bucketByDate` 与 epoch 工具(TDD)

**Files:**
- Create: `src/utils/systemCalendar.js`
- Test: `src/tests/systemCalendar.test.js`

`bucketByDate` 把扁平系统事件数组按本地时区分桶到 `YYYY-MM-DD`。这是整个特性最核心、最可测的逻辑,先做。

EKEvent 全天事件语义:`startDate`/`endDate` 都是当地 00:00,且 `endDate` **不包含**当天(独占上界)。全天事件 Jul 13 → `start=Jul13 00:00`,`end=Jul14 00:00`,故落在 Jul13 一格。

- [ ] **Step 1: 写失败测试**

Create `src/tests/systemCalendar.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  bucketByDate,
  epochStartOfDay,
  epochEndOfDay,
  localDateKey,
} from "../utils/systemCalendar";

describe("localDateKey", () => {
  it("formats a Date to YYYY-MM-DD in local tz", () => {
    const d = new Date(2026, 6, 13, 5, 30, 0); // local Jul 13 2026 05:30
    expect(localDateKey(d)).toBe("2026-07-13");
  });
});

describe("epoch helpers", () => {
  it("epochStartOfDay is local midnight, end is local 23:59:59", () => {
    const start = epochStartOfDay(2026, 7, 13);
    const end = epochEndOfDay(2026, 7, 13);
    expect(new Date(start * 1000).getHours()).toBe(0);
    expect(new Date(end * 1000).getHours()).toBe(23);
    expect(new Date(start * 1000).getDate()).toBe(13);
  });
});

describe("bucketByDate", () => {
  it("non-all-day event falls on its local start day", () => {
    // 2026-07-13T05:00:00Z -> local same-day or shifted depending on tz; use a local-noon instant
    const iso = new Date(2026, 6, 13, 12, 0, 0).toISOString();
    const buckets = bucketByDate([{ id: "1", title: "Lunch", startISO: iso, endISO: iso, allDay: false, calendarTitle: "Work", calendarColor: "#FF0000", location: null }]);
    expect(Object.keys(buckets)).toEqual(["2026-07-13"]);
    expect(buckets["2026-07-13"]).toHaveLength(1);
  });

  it("all-day single-day event falls on exactly that day", () => {
    const start = new Date(2026, 6, 13, 0, 0, 0).toISOString();
    const end = new Date(2026, 6, 14, 0, 0, 0).toISOString(); // exclusive
    const buckets = bucketByDate([{ id: "1", title: "Off", startISO: start, endISO: end, allDay: true, calendarTitle: "P", calendarColor: "#00FF00", location: null }]);
    expect(Object.keys(buckets)).toEqual(["2026-07-13"]);
  });

  it("all-day multi-day event spans each day (exclusive end)", () => {
    const start = new Date(2026, 6, 13, 0, 0, 0).toISOString();
    const end = new Date(2026, 6, 16, 0, 0, 0).toISOString(); // Jul 13,14,15
    const buckets = bucketByDate([{ id: "1", title: "Trip", startISO: start, endISO: end, allDay: true, calendarTitle: "P", calendarColor: "#0000FF", location: null }]);
    expect(Object.keys(buckets).sort()).toEqual(["2026-07-13", "2026-07-14", "2026-07-15"]);
  });

  it("multiple events aggregate into the same bucket", () => {
    const iso = new Date(2026, 6, 13, 9, 0, 0).toISOString();
    const buckets = bucketByDate([
      { id: "1", title: "A", startISO: iso, endISO: iso, allDay: false, calendarTitle: "W", calendarColor: "#111111", location: null },
      { id: "2", title: "B", startISO: iso, endISO: iso, allDay: false, calendarTitle: "W", calendarColor: "#111111", location: null },
    ]);
    expect(buckets["2026-07-13"]).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- systemCalendar.test.js`
Expected: FAIL(`systemCalendar.js` 不存在,导入报错)。

- [ ] **Step 3: 写最小实现**

Create `src/utils/systemCalendar.js`:

```js
// 系统日历事件相关纯函数:按本地时区把事件分桶到 YYYY-MM-DD。
// 无副作用、不依赖 Tauri/Vue,便于单元测试。

export function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 本地某日 00:00:00 的 epoch 秒
export function epochStartOfDay(year, month, day) {
  return Math.floor(new Date(year, month - 1, day, 0, 0, 0).getTime() / 1000);
}
// 本地某日 23:59:59 的 epoch 秒
export function epochEndOfDay(year, month, day) {
  return Math.floor(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000);
}

// events: [{ id, title, startISO, endISO, allDay, calendarTitle, calendarColor, location? }]
// 返回 { [YYYY-MM-DD]: event[] }。全天事件按起止跨越的每一天分别入桶(endDate 独占)。
export function bucketByDate(events) {
  const buckets = {};
  function push(key, ev) {
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(ev);
  }
  for (const e of events) {
    const start = new Date(e.startISO);
    if (e.allDay) {
      const end = new Date(e.endISO);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        push(localDateKey(d), e);
      }
    } else {
      push(localDateKey(start), e);
    }
  }
  return buckets;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- systemCalendar.test.js`
Expected: PASS(全部用例)。

- [ ] **Step 5: 检查点**

Run: `npm test`
Expected: 全套通过(此前 61 + 本任务新增 = 65 左右)。

---

## Task 2: 设置字段 `syncSystemCalendar`(TDD)

**Files:**
- Modify: `src/composables/useSettings.js`
- Modify: `src/tests/useSettings.test.js`

- [ ] **Step 1: 写失败测试**

在 `src/tests/useSettings.test.js` 末尾追加:

```js
  it("syncSystemCalendar defaults to false", () => {
    expect(normalizeSettings({}).syncSystemCalendar).toBe(false);
  });
  it("syncSystemCalendar coerced to boolean true only when explicitly true", () => {
    expect(normalizeSettings({ syncSystemCalendar: true }).syncSystemCalendar).toBe(true);
    expect(normalizeSettings({ syncSystemCalendar: "yes" }).syncSystemCalendar).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- useSettings.test.js`
Expected: FAIL(`syncSystemCalendar` 为 undefined)。

- [ ] **Step 3: 写实现**

在 `src/composables/useSettings.js` 的 `DEFAULT_SETTINGS` 中,`dockVisible: true` 之后加:

```js
  dockVisible: true, // macOS Dock 图标是否显示
  syncSystemCalendar: false, // 是否同步系统日历事件(只读)
```

在 `normalizeSettings` 中,`s.dockVisible = s.dockVisible !== false;` 之后加:

```js
  s.dockVisible = s.dockVisible !== false;
  s.syncSystemCalendar = s.syncSystemCalendar === true;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- useSettings.test.js`
Expected: PASS。

---

## Task 3: Swift helper `cal-sync`(含 spike 手动验证)

**Files:**
- Create: `src-tauri/swift/Mapping.swift`
- Create: `src-tauri/swift/main.swift`
- Create: `scripts/build-cal-sync.sh`

helper 输出契约:`{"status":"ok|denied|unsupported|error","events":[...]|null}`,事件字段:`id,title,startISO,endISO,allDay,calendarTitle,calendarColor,location`。`startISO/endISO` 为 RFC3339(带 `-`/`:`),保证 JS `new Date()` 可靠解析。

- [ ] **Step 1: 写映射纯文件 `Mapping.swift`**

Create `src-tauri/swift/Mapping.swift`:

```swift
import Foundation
import EventKit

struct CalEvent: Codable {
    let id: String
    let title: String
    let startISO: String
    let endISO: String
    let allDay: Bool
    let calendarTitle: String
    let calendarColor: String
    let location: String?
}

struct HelperOutput: Codable {
    let status: String
    let events: [CalEvent]?
}

let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = .withInternetDateTime // -> 2026-07-13T05:00:00Z
    return f
}()

func colorToHex(_ color: CGColor?) -> String {
    guard let color = color, let comps = color.components, comps.count >= 3 else {
        return "#888888"
    }
    let r = Int((comps[0] * 255).rounded())
    let g = Int((comps[1] * 255).rounded())
    let b = Int((comps[2] * 255).rounded())
    return String(format: "#%02X%02X%02X", r, g, b)
}

// 纯映射:不依赖 store,便于人工核对(构造 EKEvent 需要 store,故不做正式单测,靠 spike 验证)。
func mapEvents(_ events: [EKEvent]) -> [CalEvent] {
    return events.map { ev in
        CalEvent(
            id: ev.eventIdentifier ?? UUID().uuidString,
            title: ev.title ?? "",
            startISO: isoFormatter.string(from: ev.startDate),
            endISO: isoFormatter.string(from: ev.endDate),
            allDay: ev.isAllDay,
            calendarTitle: ev.calendar?.title ?? "",
            calendarColor: colorToHex(ev.calendar?.cgColor),
            location: ev.location
        )
    }
}

func emit(_ output: HelperOutput) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(output),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}
```

- [ ] **Step 2: 写入口 `main.swift`**

Create `src-tauri/swift/main.swift`:

```swift
import Foundation
import EventKit

// 解析 --start/--end(epoch 秒)
func parseArgs() -> (Date, Date)? {
    let args = CommandLine.arguments
    var start: Date?
    var end: Date?
    var i = 1
    while i < args.count {
        if args[i] == "--start", i + 1 < args.count, let s = Double(args[i + 1]) {
            start = Date(timeIntervalSince1970: s); i += 2; continue
        }
        if args[i] == "--end", i + 1 < args.count, let e = Double(args[i + 1]) {
            end = Date(timeIntervalSince1970: e); i += 2; continue
        }
        i += 1
    }
    guard let s = start, let e = end else { return nil }
    return (s, e)
}

guard let (startDate, endDate) = parseArgs() else {
    emit(HelperOutput(status: "error", events: nil))
    exit(2)
}

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var granted = false

if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { accessGranted, _ in
        granted = accessGranted
        semaphore.signal()
    }
} else {
    store.requestAccess(to: .event) { accessGranted, _ in
        granted = accessGranted
        semaphore.signal()
    }
}
semaphore.wait()

if !granted {
    emit(HelperOutput(status: "denied", events: nil))
    exit(0)
}

let predicate = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
let events = store.events(matching: predicate)
emit(HelperOutput(status: "ok", events: mapEvents(events)))
```

- [ ] **Step 3: 写编译脚本 `scripts/build-cal-sync.sh`**

Create `scripts/build-cal-sync.sh`:

```bash
#!/usr/bin/env bash
# 编译 Swift helper(调 EventKit 读系统日历事件)到 src-tauri/bin/cal-sync
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src-tauri/bin
xcrun swiftc -O \
  src-tauri/swift/main.swift \
  src-tauri/swift/Mapping.swift \
  -o src-tauri/bin/cal-sync \
  -framework EventKit -framework Foundation
chmod +x src-tauri/bin/cal-sync
echo "[build-cal-sync] -> src-tauri/bin/cal-sync"
```

- [ ] **Step 4: 编译**

Run: `bash scripts/build-cal-sync.sh`
Expected: 输出 `[build-cal-sync] -> src-tauri/bin/cal-sync`,无编译错误。

> 若报 `requestFullAccessToEvents` 不存在:确认 `xcrun --show-sdk-path` 指向 macOS 14+ SDK(用户机器 Darwin 25.5 足够新)。仍不行则把那段换成旧 API `store.requestAccess(to: .event){ ... }`(去掉 `#available` 分支)。

- [ ] **Step 5: spike 手动验证(直接终端跑)**

计算"今天前后 15 天"的 epoch:
```bash
S=$(python3 -c 'import time; print(int(time.time())-86400*15)')
E=$(python3 -c 'import time; print(int(time.time())+86400*15)')
./src-tauri/bin/cal-sync --start "$S" --end "$E"
```

Expected:
- 首次运行弹出系统权限弹窗"日历 想要访问你的日历"。点允许。
- 之后输出形如:`{"status":"ok","events":[{"id":"...","title":"...","startISO":"2026-07-13T...","endISO":"...","allDay":false,"calendarTitle":"...","calendarColor":"#...","location":null}, ...]}`
- 若授权拒绝 → `{"status":"denied","events":null}`

> ✅ **spike 关卡 1**:能编译、能弹权限、能返回真实事件 JSON。未通过则停下排查 Swift/EventKit,不要继续。

---

## Task 4: Rust 命令 `fetch_system_events`(TDD 纯解析)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 加依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 段加(与现有 `tauri = {...}` 同段):

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: 写 `parse_payload` 纯函数 + 单测**

修改 `src-tauri/src/lib.rs`,在文件顶部 `use` 之后、`quit_app` 之前加:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct CalEvent {
    pub id: String,
    pub title: String,
    #[serde(rename = "startISO")]
    pub start_iso: String,
    #[serde(rename = "endISO")]
    pub end_iso: String,
    #[serde(rename = "allDay")]
    pub all_day: bool,
    #[serde(rename = "calendarTitle")]
    pub calendar_title: String,
    #[serde(rename = "calendarColor")]
    pub calendar_color: String,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct SystemEventsPayload {
    pub status: String,
    pub events: Option<Vec<CalEvent>>,
}

// 纯函数:把 helper stdout 解析为 payload。单独可测。
pub fn parse_payload(json: &str) -> Result<SystemEventsPayload, serde_json::Error> {
    serde_json::from_str(json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok_with_events() {
        let json = r#"{"status":"ok","events":[{"id":"x","title":"Lunch","startISO":"2026-07-13T05:00:00Z","endISO":"2026-07-13T06:00:00Z","allDay":false,"calendarTitle":"Work","calendarColor":"#FF0000","location":null}]}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.status, "ok");
        let ev = p.events.unwrap().pop().unwrap();
        assert_eq!(ev.title, "Lunch");
        assert_eq!(ev.calendar_color, "#FF0000");
        assert_eq!(ev.location, None);
    }

    #[test]
    fn parse_denied() {
        let p = parse_payload(r#"{"status":"denied","events":null}"#).unwrap();
        assert_eq!(p.status, "denied");
        assert!(p.events.is_none());
    }
}
```

- [ ] **Step 3: 跑 Rust 单测确认通过**

Run: `cd src-tauri && cargo test parse_payload -- --nocapture`
Expected: 两个测试 PASS。

- [ ] **Step 4: 写 `fetch_system_events` 命令**

在 `src-tauri/src/lib.rs` 中,`set_dock_visible` 之后加命令,并把命令名加进 `invoke_handler`:

命令实现:

```rust
// macOS:spawn cal-sync helper 读系统日历事件(只读)。其它平台返回 unsupported。
#[tauri::command]
fn fetch_system_events(
    app_handle: tauri::AppHandle,
    start: f64,
    end: f64,
) -> Result<SystemEventsPayload, String> {
    #[cfg(target_os = "macos")]
    {
        // 优先用 bundle 资源(prod);回退到源码侧 dev 产物(dev 下未打包)。
        let helper = app_handle
            .path()
            .resource_dir()
            .ok()
            .map(|d| d.join("cal-sync"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| std::path::PathBuf::from(format!("{}/bin/cal-sync", env!("CARGO_MANIFEST_DIR"))));

        let output = std::process::Command::new(&helper)
            .args(["--start", &start.to_string(), "--end", &end.to_string()])
            .output()
            .map_err(|e| format!("spawn helper: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_payload(stdout.trim()).map_err(|e| format!("parse helper json: {e}"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, start, end);
        Ok(SystemEventsPayload { status: "unsupported".into(), events: None })
    }
}
```

> `tauri::path()` 在 Tauri 2 上 `app_handle.path()` 返回 `PathResolver`,`resource_dir()` 返回 `Result<PathBuf, Error>`(`.ok()` → Option)。若编译报 `resource_dir` 签名不符,改用 `app_handle.path().resource_dir().map_err(|e| e.to_string())?` 直接取(去掉 `filter` 回退链),dev 测试靠 Task 5 的资源解析。

更新 handler(在 `lib.rs` 现有 `invoke_handler` 行):

```rust
        .invoke_handler(tauri::generate_handler![quit_app, set_dock_visible, fetch_system_events])
```

- [ ] **Step 5: 编译验证**

Run: `cd src-tauri && cargo build --release 2>&1 | tail -5`
Expected: `Finished` 无错。若 `#[cfg(not(target_os="macos"))]` 分支变量未用告警已用 `let _ = (...)` 处理。

---

## Task 5: 打包配置(Info.plist + resources + 构建脚本)

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`

- [ ] **Step 1: tauri.conf.json 加 Info.plist 用途字符串 + resources + 前置构建**

把 `tauri.conf.json` 的 `build` 段改为(在 dev/build 前先编 Swift helper):

```json
  "build": {
    "beforeDevCommand": "npm run predev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run prebuild",
    "frontendDist": "../dist"
  },
```

把 `bundle` 段改为(加 `macOS.infoPlist` 与 `resources`):

```json
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": ["bin/cal-sync"],
    "macOS": {
      "infoPlist": {
        "NSCalendarsUsageDescription": "用于在日历中显示你的系统日历事件(只读)。"
      }
    }
  }
```

- [ ] **Step 2: package.json 加脚本**

在 `package.json` 的 `scripts` 段加(保留现有 `dev`/`build`/`test`/`tauri`):

```json
    "build:swift": "bash scripts/build-cal-sync.sh",
    "predev": "npm run build:swift && npm run dev",
    "prebuild": "npm run build:swift && npm run build"
```

- [ ] **Step 3: 验证打包能成功(此时前端尚未调用,仅验证 helper 进 bundle + plist 正确)**

Run: `npm run tauri build 2>&1 | tail -8`
Expected: 成功生成 `日历.app` 与 dmg,无错。

验证 Info.plist 写入:
```bash
/usr/libexec/PlistBuddy -c 'Print :NSCalendarsUsageDescription' "src-tauri/target/release/bundle/macos/日历.app/Contents/Info.plist"
```
Expected: 打印 `用于在日历中显示你的系统日历事件(只读)。`

验证 helper 进 bundle:
```bash
ls "src-tauri/target/release/bundle/macos/日历.app/Contents/Resources/" | grep cal-sync
```
Expected: 输出 `cal-sync`。

> ✅ **spike 关卡 2(在 Task 7 接好前端后再做一次)**:从主 App 内触发拉取,观察权限弹窗**是否归属主 App**(标题为"日历"),且重启 App 后授权仍生效。若归属不对,停下重评估。

---

## Task 6: 前端组合式 `useSystemCalendar`

**Files:**
- Create: `src/composables/useSystemCalendar.js`
- Test: `src/tests/useSystemCalendar.test.js`

把"调命令 + 分桶 + 状态机"封进组合式。`invoke` 注入便于测试。

- [ ] **Step 1: 写测试**

Create `src/tests/useSystemCalendar.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { useSystemCalendar } from "../composables/useSystemCalendar";

function fakeInvoke(payload) {
  return vi.fn().mockResolvedValue(payload);
}

describe("useSystemCalendar", () => {
  it("disabled: fetchRange clears and stays idle", async () => {
    const enabled = { value: false };
    const invoke = fakeInvoke({ status: "ok", events: [] });
    const { status, systemEventsByDate, fetchRange } = useSystemCalendar(
      () => enabled.value,
      invoke
    );
    await fetchRange(0, 1);
    expect(invoke).not.toHaveBeenCalled();
    expect(status.value).toBe("idle");
    expect(systemEventsByDate.value).toEqual({});
  });

  it("ok: buckets events and sets status ok", async () => {
    const enabled = { value: true };
    const iso = new Date(2026, 6, 13, 9, 0, 0).toISOString();
    const invoke = fakeInvoke({
      status: "ok",
      events: [{ id: "1", title: "A", startISO: iso, endISO: iso, allDay: false, calendarTitle: "W", calendarColor: "#111", location: null }],
    });
    const { status, systemEventsByDate, fetchRange } = useSystemCalendar(
      () => enabled.value,
      invoke
    );
    await fetchRange(0, 1);
    expect(invoke).toHaveBeenCalledWith("fetch_system_events", { start: 0, end: 1 });
    expect(status.value).toBe("ok");
    expect(systemEventsByDate.value["2026-07-13"]).toHaveLength(1);
  });

  it("denied: status follows payload", async () => {
    const invoke = fakeInvoke({ status: "denied", events: null });
    const { status, fetchRange } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    expect(status.value).toBe("denied");
  });

  it("invoke throws: status error", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("boom"));
    const { status, fetchRange } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    expect(status.value).toBe("error");
  });

  it("clear() resets state", async () => {
    const iso = new Date(2026, 6, 13, 9, 0, 0).toISOString();
    const invoke = fakeInvoke({ status: "ok", events: [{ id: "1", title: "A", startISO: iso, endISO: iso, allDay: false, calendarTitle: "W", calendarColor: "#111", location: null }] });
    const { status, systemEventsByDate, fetchRange, clear } = useSystemCalendar(() => true, invoke);
    await fetchRange(0, 1);
    clear();
    expect(status.value).toBe("idle");
    expect(systemEventsByDate.value).toEqual({});
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- useSystemCalendar.test.js`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 写实现**

Create `src/composables/useSystemCalendar.js`:

```js
import { ref } from "vue";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { bucketByDate } from "../utils/systemCalendar";

// 同步系统日历(只读)。
// getEnabled: () => boolean —— 是否启用。
// invoke: 默认走 Tauri;测试可注入。
export function useSystemCalendar(getEnabled, invoke = tauriInvoke) {
  const systemEventsByDate = ref({});
  const status = ref("idle"); // idle|loading|ok|denied|error|unsupported

  async function fetchRange(startEpoch, endEpoch) {
    if (!getEnabled()) {
      clear();
      return;
    }
    status.value = "loading";
    try {
      const payload = await invoke("fetch_system_events", { start: startEpoch, end: endEpoch });
      if (payload && payload.status === "ok") {
        // 整体覆盖可见窗口
        systemEventsByDate.value = bucketByDate(payload.events || []);
        status.value = "ok";
      } else if (payload && payload.status) {
        status.value = payload.status; // denied | unsupported | error
        if (payload.status !== "ok") systemEventsByDate.value = {};
      } else {
        status.value = "error";
      }
    } catch {
      status.value = "error";
    }
  }

  function clear() {
    systemEventsByDate.value = {};
    status.value = "idle";
  }

  return { systemEventsByDate, status, fetchRange, clear };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- useSystemCalendar.test.js`
Expected: PASS。

- [ ] **Step 5: 检查点**

Run: `npm test`
Expected: 全套通过。

---

## Task 7: CalendarWidget 接入(切月/跨天拉取 + 网格圆点)

**Files:**
- Modify: `src/components/CalendarWidget.vue`

- [ ] **Step 1: 引入组合式并计算可见窗口**

在 `CalendarWidget.vue` `<script setup>` 顶部 import 区加:

```js
import { useSystemCalendar } from "../composables/useSystemCalendar";
import { epochStartOfDay, epochEndOfDay } from "../utils/systemCalendar";
```

在 `useReminders(eventsByDate);` 之后(`onMounted` 之前)加:

```js
const { systemEventsByDate, status: systemStatus, fetchRange: fetchSystemRange, clear: clearSystem } = useSystemCalendar(
  () => props.settings.syncSystemCalendar
);

// 可见窗口 = cells 首格..末格(约 42 天),用于按窗口拉取系统事件。
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
```

需在顶部 import 中把 `watch` 加入(当前是 `import { ref, computed, onMounted, onUnmounted } from "vue";`)→ 改为:

```js
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
```

- [ ] **Step 2: 把系统事件并入网格圆点,并在切月/跨天时刷新**

修改 `cells` computed 的返回对象,把 `hasEvent` 改为本地或系统:

```js
      hasEvent:
        (eventsByDate.value[day.key] || []).length > 0 ||
        (systemEventsByDate.value[day.key] || []).length > 0,
```

在 `onMounted` 回调里追加首拉 + 切月监听:

```js
onMounted(() => {
  rolloverTimer = setInterval(checkDayRollover, 30_000);
  window.addEventListener("focus", checkDayRollover);
  document.addEventListener("visibilitychange", onVisibility);
  if (props.settings.syncSystemCalendar) refreshSystemForWindow();
  watch([year, month], refreshSystemForWindow);
});
```

并把 `checkDayRollover` 末尾(系统事件也要跟着跨天刷新窗口)更新为:

```js
function checkDayRollover() {
  const oldToday = todayKey.value;
  if (!refreshToday()) return;
  if (selectedKey.value === oldToday) selectedKey.value = todayKey.value;
  refreshSystemForWindow();
}
```

- [ ] **Step 3: 传系统事件给 EventPanel**

在 template 的 `<EventPanel ... />` 上加两个 prop:

```html
    <EventPanel
      :date-key="selectedKey"
      :lunar-label="selectedLunar"
      :events="selectedEvents"
      :system-events="systemEventsByDate[selectedKey] || []"
      :system-status="systemStatus"
      :system-enabled="settings.syncSystemCalendar"
      @add="openAddEvent"
      @remove="removeEvent"
      @update="(e) => updateEvent(e.id, e)"
    />
```

- [ ] **Step 4: 编译/启动验证**

Run: `npm run tauri dev`(会先跑 `predev` 编 helper)
Expected: 应用正常启动,无控制台报错。开启设置里的"同步系统日历"(Task 9 加)后应能弹权限并拉到事件(此时 UI 还没分区,先确认数据通了;或等 Task 8/9 完成再整体验证)。

---

## Task 8: EventPanel 分区显示 + 状态行

**Files:**
- Modify: `src/components/EventPanel.vue`

- [ ] **Step 1: 加 props**

`<script setup>` 的 props 加三项:

```js
const props = defineProps({
  dateKey: { type: String, default: "" },
  lunarLabel: { type: String, default: "" },
  events: { type: Array, default: () => [] },
  systemEvents: { type: Array, default: () => [] },
  systemStatus: { type: String, default: "idle" },
  systemEnabled: { type: Boolean, default: false },
});
```

- [ ] **Step 2: 排序计算属性**

在 `const emit = ...` 之后加:

```js
import { openUrl } from "@tauri-apps/plugin-opener";

const sortedSystem = computed(() =>
  [...props.systemEvents].sort((a, b) => a.startISO.localeCompare(b.startISO))
);
function sysTime(ev) {
  if (ev.allDay) return "全天";
  const d = new Date(ev.startISO);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
async function openPrivacySettings() {
  try {
    await openUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars");
  } catch { /* 非 Tauri 忽略 */ }
}
```

(顶部 import 行 `import { ref, computed } from "vue";` 保持不变,`computed` 已在。)

- [ ] **Step 3: 模板加系统日历区**

在 `<div class="event-list">` **之前**插入系统区:

```html
    <div v-if="systemEnabled" class="sys-section">
      <div class="section-title">系统日历</div>
      <div v-if="systemStatus === 'denied'" class="sys-hint" @click="openPrivacySettings">
        未授权访问日历 → 前往系统设置
      </div>
      <div v-else-if="systemStatus === 'loading'" class="sys-hint">同步中…</div>
      <div v-else-if="systemStatus === 'error'" class="sys-hint">同步失败</div>
      <div v-else-if="systemStatus === 'unsupported'" class="sys-hint">仅 macOS 支持</div>
      <div v-else class="event-list">
        <div v-for="e in sortedSystem" :key="e.id" class="event-item sys-item">
          <span class="time">{{ sysTime(e) }}</span>
          <span class="cal-dot" :style="{ background: e.calendarColor }"></span>
          <span class="evt-title">{{ e.title }}</span>
        </div>
        <div v-if="!sortedSystem.length" class="empty">这一天没有系统日历事件</div>
      </div>
    </div>
```

- [ ] **Step 4: 加样式**

在 `<style scoped>` 末尾追加:

```css
.sys-section { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; }
.sys-section .section-title { font-size: 11px; font-weight: 600; opacity: 0.6; }
.sys-item { cursor: default; }
.sys-item:hover { background: var(--hover); }
.cal-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.sys-hint { font-size: 11px; opacity: 0.7; padding: 6px 8px; cursor: pointer; }
```

并把 `.event-list` 的 `max-height: 140px` 改为 `max-height: 110px`,让两区都能放下(可后续微调)。

- [ ] **Step 5: 检查点**

Run: `npm test`
Expected: 全套通过(UI 改动不影响纯函数测试)。

---

## Task 9: SettingsPanel 开关

**Files:**
- Modify: `src/components/SettingsPanel.vue`

- [ ] **Step 1: 加开关 UI**

在"显示节假日" `<label class="row switch">...` 之后、"在 Dock 中显示图标" 之前(或其之后,同区),插入:

```html
      <label class="row switch">
        <span class="lbl">同步系统日历(只读)</span>
        <input type="checkbox" :checked="settings.syncSystemCalendar" @change="emit('update', { syncSystemCalendar: $event.target.checked })" />
      </label>
```

- [ ] **Step 2: 检查点**

Run: `npm test && npm run tauri build 2>&1 | tail -6`
Expected: 测试通过;打包成功。

---

## Task 10: 集成手动验证 + 最终打包

**Files:** 无(验证)

- [ ] **Step 1: 完整打包**

Run: `npm run tauri build`
Expected: 生成 dmg。

- [ ] **Step 2: 安装并验证(本机)**

打开生成的 dmg,拖入"应用程序",启动。

逐项验证:
1. 默认"同步系统日历"关 → 事件面板只有"我的事件"区。
2. 打开开关 → 弹系统权限"日历 想要访问你的日历",允许。
   - ✅ **spike 关卡 2**:弹窗标题为"日历"(主 App),不是 "cal-sync"。授权后重启 App 仍生效。
3. 有事件的日期:网格圆点点亮;点开当天 → "系统日历"区列出事件(时间 + 颜色圆点 + 标题),全天事件显示"全天"。
4. 订阅日历(如 iCloud/Google)的事件也出现。
5. 切月 → 系统事件随窗口刷新。
6. 在系统设置里撤销权限 → 重新打开 App 拉取 → "系统日历"区显示"未授权访问日历 → 前往系统设置",点击跳转。
7. 系统事件点击不进入编辑态(只读)。
8. 本地事件增删改仍正常,与系统事件分区互不影响。

- [ ] **Step 3: 若关卡 2 失败(TCC 归属不对)**

停下,不在本计划内硬冲。回到 spec 的风险节,评估:(a) 让主进程而非 helper 触发权限请求;(b) 改 dylib 方案。与用户确认后再继续。

- [ ] **Step 4: 全套测试最终确认**

Run: `npm test`
Expected: 全绿。

---

## Self-Review(计划完成后核对)

**Spec 覆盖:**
- 三层架构 → Task 3/4/6 ✓
- 数据模型 → Task 3(Mapping.swift)+ Task 1(bucketByDate)✓
- 数据流 → Task 6/7 ✓
- 网格圆点 → Task 7 Step 2 ✓
- EventPanel 分区 → Task 8 ✓
- 权限/Info.plist → Task 5 ✓
- 设置开关(默认关)→ Task 2/9 ✓
- 刷新(切月/跨天,非聚焦)→ Task 7 ✓
- 测试策略 → Task 1(bucketByDate)、Task 4(parse_payload)、Task 6(composable);Swift mapEvents 靠 spike(Task 3 Step 5)✓
- 风险(TCC 归属)→ Task 3 Step 5 关卡 1 + Task 10 Step 2 关卡 2 + Task 10 Step 3 应急 ✓
- Spike 计划 → 折入 Task 3 + Task 5/10 ✓

**占位符扫描:** 无 TBD/TODO;每步含完整代码或确切命令。

**类型一致性:** 事件字段 `id,title,startISO,endISO,allDay,calendarTitle,calendarColor,location` 在 Swift(`Mapping.swift`)、Rust(`CalEvent` serde rename)、JS(`bucketByDate`/composable/EventPanel)三处一致。`status` 取值 `idle|loading|ok|denied|error|unsupported` 在 composable 与 EventPanel 一致。
