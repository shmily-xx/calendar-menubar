# 菜单栏日历 + 国内节假日 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing always-on-top calendar window into a macOS menu-bar accessory (tray icon → popup) and add Chinese statutory holidays (放假/调休/补班) plus a settings panel.

**Architecture:** Vue 3 frontend continues to own all logic. New composables: `useHolidays` (bundled+cached holiday data), `useSettings` (preferences), `useTray` (tray icon, click→positioned popup, dismiss-on-blur). Tauri Rust only adds `set_activation_policy(Accessory)` (no Dock). Tray + window control done from JS via `@tauri-apps/api`.

**Tech Stack:** Tauri 2 (`@tauri-apps/api` 2.11.1 — verified APIs below), Vue 3, `lunar-javascript`, Vitest. Holiday data: `NateScarlet/holiday-cn` JSON.

**Prerequisite note (git):** Project is not a git repo. Commit steps are optional checkpoints; skip them unless `git init` has been run.

**Verified APIs (exact, from installed package + official reference):**
- `import { TrayIcon } from "@tauri-apps/api/tray"` → `await TrayIcon.new({ id, tooltip, icon, iconAsTemplate, action })`; `action(event)` receives `{ type: "Click", button: "Left"|"Right"|"Middle", position: PhysicalPosition, rect: { position: PhysicalPosition, size: PhysicalSize } }`. Methods: `setIcon(img)`, `setIconAsTemplate(bool)`.
- `import { Image } from "@tauri-apps/api/image"` → `await Image.new(rgba /*Uint8Array|number[]*/, width, height)`.
- `import { getCurrentWindow } from "@tauri-apps/api/window"` → `.show()`, `.hide()`, `.setFocus()`, `.isVisible()`, `.setPosition(new PhysicalPosition(x,y))`, `.outerSize()` (PhysicalSize), `.currentMonitor()`, `.scaleFactor()`, `.onFocusChanged(cb)`.
- `import { PhysicalPosition } from "@tauri-apps/api/dpi"`.
- Rust: `app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory)?;` inside `#[cfg(target_os = "macos")]` — it is an **inherent method on `AppHandle`** (tauri 2.11.5, no extra `use`). `tauri::ActivationPolicy` is re-exported at the crate root.
- `setIcon` requires the `image-png` Cargo feature on `tauri`; transparent windows (`macOSPrivateApi: true`) require the `macos-private-api` feature; **system tray requires the `tray-icon` feature** — without it every JS tray call throws `"plugin tray not found"` (this was the root cause of the first build showing no menu-bar icon; debugged via a Rust `eprintln` command surfaced from JS).

---

## File Structure

**Create:**
- `src/holidays/2026.json`, `src/holidays/2027.json` — bundled holiday data.
- `src/composables/useHolidays.js` — parse bundled JSON → per-date lookup; best-effort online refresh.
- `src/composables/useSettings.js` — settings store (pure `loadSettings`/`saveSettings` + reactive composable).
- `src/utils/trayIcon.js` — `trayContent(mode, info)` (pure descriptor) + `renderTrayIcon(...)` (canvas→Image).
- `src/utils/popupPosition.js` — `computePopupPosition(rect, winSize, monitor)` pure math.
- `src/composables/useTray.js` — create tray, click→toggle+position, blur→hide, icon refresh.
- `src/components/SettingsPanel.vue` — settings UI.
- Tests: `src/tests/useHolidays.test.js`, `useSettings.test.js`, `trayIcon.test.js`, `popupPosition.test.js`.

**Modify:**
- `src/composables/useCalendar.js` — `buildMonthMatrix(year, month, weekStart)` + `weekdayHeader(weekStart)`.
- `src/components/DayCell.vue` — holiday name / 补班 "班" badge; respect `showLunar`.
- `src/components/MonthGrid.vue` — weekday header from `weekdayHeader`.
- `src/components/CalendarWidget.vue` — frameless header (remove traffic-light padding & drag), gear button, settings wiring, holiday footer, theme/weekStart/showLunar/showHolidays reactivity.
- `src/App.vue` — CSS variables + `[data-theme]` theming (light/dark/auto).
- `src-tauri/tauri.conf.json` — frameless hidden popup window, `macOSPrivateApi`, `shadow`.
- `src-tauri/Cargo.toml` — add `image-png` feature to `tauri`.
- `src-tauri/src/lib.rs` — activation policy Accessory.
- `src-tauri/capabilities/default.json` — tray + window permissions.

---

## Task 1: Holiday data + useHolidays (TDD)

**Files:**
- Create: `src/holidays/2026.json`, `src/holidays/2027.json`
- Create: `src/composables/useHolidays.js`
- Test: `src/tests/useHolidays.test.js`

- [ ] **Step 1: Download the bundled holiday JSON**

Run:
```bash
mkdir -p src/holidays
curl -fsSL -o src/holidays/2026.json https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json
curl -fsSL -o src/holidays/2027.json https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2027.json
head -c 400 src/holidays/2026.json
```
Expected: two JSON files; the `head` shows an object with a `"days"` array where each entry is `{ "name": "...", "date": "2026-01-01", "isOffDay": true }`. (If a year file 404s, create an empty `{"days":[]}` placeholder so imports don't break.)

- [ ] **Step 2: Write the failing tests**

Create `src/tests/useHolidays.test.js`:
```js
import { describe, it, expect } from "vitest";
import { parseHolidays, isHoliday, isWorkday, holidayLabel, nextHolidayFrom } from "../composables/useHolidays";

// Two sample years merged, mirroring NateScarlet/holiday-cn shape.
const data = parseHolidays([
  {
    days: [
      { name: "元旦", date: "2026-01-01", isOffDay: true },
      { name: "元旦", date: "2026-01-02", isOffDay: true },
      { name: "春节", date: "2026-02-17", isOffDay: true },
      { name: "春节", date: "2026-02-22", isOffDay: false }, // 调休上班
    ],
  },
]);

describe("parseHolidays + lookups", () => {
  it("flags an off-day as holiday", () => {
    expect(isHoliday(data, "2026-01-01")).toBe(true);
    expect(holidayLabel(data, "2026-01-01")).toBe("元旦");
  });
  it("flags a 调休 workday (weekend made working)", () => {
    expect(isWorkday(data, "2026-02-22")).toBe(true);
    expect(isHoliday(data, "2026-02-22")).toBe(false);
  });
  it("returns false / '' for ordinary days", () => {
    expect(isHoliday(data, "2026-03-15")).toBe(false);
    expect(isWorkday(data, "2026-03-15")).toBe(false);
    expect(holidayLabel(data, "2026-03-15")).toBe("");
  });
});

describe("nextHolidayFrom", () => {
  it("finds the next off-day after a given date and counts days", () => {
    const r = nextHolidayFrom(data, "2026-01-03");
    expect(r).not.toBeNull();
    expect(r.name).toBe("春节");
    expect(r.date).toBe("2026-02-17");
    expect(r.daysUntil).toBe(45); // Jan 3 -> Feb 17
  });
  it("returns null when nothing ahead", () => {
    expect(nextHolidayFrom(data, "2026-12-31")).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/composables/useHolidays.js`**

```js
import { ref } from "vue";
import data2026 from "../holidays/2026.json";
import data2027 from "../holidays/2027.json";

const CACHE_KEY = "calendar:holidays:updated";
const RAW_KEY = "calendar:holidays:raw";

// Build a Map<YYYY-MM-DD, { off: boolean, name: string }> from holiday-cn year objects.
export function parseHolidays(years) {
  const map = new Map();
  for (const year of years) {
    for (const d of year.days || []) {
      map.set(d.date, { off: !!d.isOffDay, name: d.name || "" });
    }
  }
  return map;
}

export function isHoliday(data, key) {
  const e = data.get(key);
  return !!e && e.off;
}
export function isWorkday(data, key) {
  const e = data.get(key);
  return !!e && !e.off; // 补班: weekend made working
}
export function holidayLabel(data, key) {
  const e = data.get(key);
  return e && e.off ? e.name : "";
}

export function nextHolidayFrom(data, fromKey) {
  const entries = [...data.entries()]
    .filter(([k, v]) => v.off && k > fromKey)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return null;
  const [date, { name }] = entries[0];
  const daysUntil = Math.round(
    (Date.parse(date) - Date.parse(fromKey)) / 86400000
  );
  return { date, name, daysUntil };
}

let _data = null;
function bundled() {
  if (!_data) _data = parseHolidays([data2026, data2027]);
  return _data;
}

// Best-effort online refresh: never throws, never blocks long.
export async function refreshHolidays() {
  try {
    const last = Number(localStorage.getItem(CACHE_KEY) || 0);
    if (Date.now() - last < 7 * 86400000) return; // fresh enough
    const year = new Date().getFullYear();
    const res = await fetch(
      `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
    );
    if (!res.ok) return;
    const json = await res.json();
    localStorage.setItem(RAW_KEY, JSON.stringify(json));
    localStorage.setItem(CACHE_KEY, String(Date.now()));
  } catch {
    /* offline / blocked: ignore, fall back to bundled */
  }
}

function mergedWithCache() {
  const base = bundled();
  try {
    const raw = localStorage.getItem(RAW_KEY);
    if (!raw) return base;
    const extra = parseHolidays([JSON.parse(raw)]);
    return new Map([...base, ...extra]);
  } catch {
    return base;
  }
}

export function useHolidays() {
  const data = ref(mergedWithCache());
  return { data, refresh: refreshHolidays };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all holiday tests green.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/holidays src/composables/useHolidays.js src/tests/useHolidays.test.js
git commit -m "feat(holidays): add Chinese holiday data and lookups"
```

---

## Task 2: Settings store (TDD)

**Files:**
- Create: `src/composables/useSettings.js`
- Test: `src/tests/useSettings.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/useSettings.test.js`:
```js
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, normalizeSettings } from "../composables/useSettings";

function memStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
}

describe("loadSettings / saveSettings", () => {
  it("returns defaults when empty", () => {
    expect(loadSettings(memStorage())).toEqual(DEFAULT_SETTINGS);
  });
  it("returns defaults on corrupt JSON", () => {
    expect(loadSettings(memStorage({ "calendar:settings": "x" })).trayIconMode).toBe(DEFAULT_SETTINGS.trayIconMode);
  });
  it("round-trips merged settings", () => {
    const s = memStorage();
    saveSettings(s, { ...DEFAULT_SETTINGS, weekStart: 0 });
    expect(loadSettings(s).weekStart).toBe(0);
  });
});

describe("normalizeSettings", () => {
  it("clamps unknown enum values back to defaults", () => {
    const n = normalizeSettings({ trayIconMode: "weird", theme: "nope" });
    expect(n.trayIconMode).toBe(DEFAULT_SETTINGS.trayIconMode);
    expect(n.theme).toBe(DEFAULT_SETTINGS.theme);
  });
  it("weekStart must be 0 or 1", () => {
    expect(normalizeSettings({ weekStart: 5 }).weekStart).toBe(DEFAULT_SETTINGS.weekStart);
    expect(normalizeSettings({ weekStart: 0 }).weekStart).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL (module not found).

- [ ] **Step 3: Implement `src/composables/useSettings.js`**

```js
import { ref, watch } from "vue";

const KEY = "calendar:settings";

export const DEFAULT_SETTINGS = {
  trayIconMode: "date", // "icon" | "date" | "lunar"
  weekStart: 1, // 1 = Monday, 0 = Sunday
  theme: "auto", // "auto" | "light" | "dark"
  showLunar: true,
  showHolidays: true,
};

const TRAY_MODES = ["icon", "date", "lunar"];
const THEMES = ["auto", "light", "dark"];

export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (!TRAY_MODES.includes(s.trayIconMode)) s.trayIconMode = DEFAULT_SETTINGS.trayIconMode;
  if (!THEMES.includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
  if (s.weekStart !== 0 && s.weekStart !== 1) s.weekStart = DEFAULT_SETTINGS.weekStart;
  s.showLunar = s.showLunar !== false; // default true
  s.showHolidays = s.showHolidays !== false;
  return s;
}

export function loadSettings(storage) {
  try {
    const raw = storage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  storage.setItem(KEY, JSON.stringify(normalizeSettings(settings)));
}

export function useSettings(storage = localStorage) {
  const settings = ref(loadSettings(storage));
  watch(
    settings,
    (v) => saveSettings(storage, v),
    { deep: true }
  );
  function update(patch) {
    settings.value = normalizeSettings({ ...settings.value, ...patch });
  }
  return { settings, update };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → PASS.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/composables/useSettings.js src/tests/useSettings.test.js
git commit -m "feat(settings): add preferences store with validation"
```

---

## Task 3: Tray icon content + popup position math (TDD)

**Files:**
- Create: `src/utils/trayIcon.js`
- Create: `src/utils/popupPosition.js`
- Test: `src/tests/trayIcon.test.js`, `src/tests/popupPosition.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/trayIcon.test.js`:
```js
import { describe, it, expect } from "vitest";
import { trayContent } from "../utils/trayIcon";

describe("trayContent", () => {
  it("icon mode draws a calendar glyph", () => {
    const c = trayContent("icon", { solarDay: 9, lunarDay: "初九" });
    expect(c.width).toBeGreaterThan(0);
    expect(c.height).toBeGreaterThan(0);
    expect(c.draw).toBe("glyph");
  });
  it("date mode renders the solar day number", () => {
    const c = trayContent("date", { solarDay: 10, lunarDay: "十五" });
    expect(c.draw).toBe("text");
    expect(c.text).toBe("10");
  });
  it("lunar mode renders the lunar day text", () => {
    const c = trayContent("lunar", { solarDay: 10, lunarDay: "十五" });
    expect(c.draw).toBe("text");
    expect(c.text).toBe("十五");
  });
});
```

Create `src/tests/popupPosition.test.js`:
```js
import { describe, it, expect } from "vitest";
import { computePopupPosition } from "../utils/popupPosition";

const rect = { position: { x: 2400, y: 0 }, size: { width: 30, height: 30 } };
const monitor = { position: { x: 0, y: 0 }, size: { width: 2560, height: 1440 } };

describe("computePopupPosition", () => {
  it("places the window just below the icon, right-aligned to the icon's right edge", () => {
    const winSize = { width: 340, height: 460 };
    const p = computePopupPosition(rect, winSize, monitor);
    expect(p.x).toBe(2430 - 340); // iconRight(2430) - width
    expect(p.y).toBe(30 + 6); // iconBottom + gap
  });
  it("clamps to the right screen edge", () => {
    const r = { position: { x: 2540, y: 0 }, size: { width: 30, height: 30 } };
    const p = computePopupPosition(r, { width: 340, height: 460 }, monitor);
    expect(p.x + 340).toBeLessThanOrEqual(monitor.position.x + monitor.size.width);
  });
  it("falls above the icon when it does not fit below", () => {
    const bottomRect = { position: { x: 2400, y: 1400 }, size: { width: 30, height: 30 } };
    const p = computePopupPosition(bottomRect, { width: 340, height: 460 }, monitor);
    expect(p.y).toBeLessThan(1400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL (modules not found).

- [ ] **Step 3: Implement `src/utils/trayIcon.js`**

```js
// Pure descriptor of what to draw on the tray icon. Tested.
export function trayContent(mode, { solarDay, lunarDay }) {
  const W = 44; // @2x canvas; tray scales down. Square template.
  if (mode === "icon") {
    return { width: W, height: W, draw: "glyph" };
  }
  if (mode === "lunar") {
    return { width: W, height: W, draw: "text", text: String(lunarDay ?? "") };
  }
  return { width: W, height: W, draw: "text", text: String(solarDay ?? "") };
}

// Draws a simple calendar glyph into a 2D context (used by 'icon' mode).
function drawGlyph(ctx, w, h) {
  const pad = w * 0.18;
  const bodyX = pad;
  const bodyY = pad + w * 0.08;
  const bodyW = w - pad * 2;
  const bodyH = h - pad * 2 - w * 0.08;
  ctx.lineWidth = Math.max(2, w * 0.06);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  // outline
  ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);
  // top binding bar
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH * 0.26);
  // two rings
  const ringR = w * 0.045;
  ctx.beginPath();
  ctx.arc(bodyX + bodyW * 0.28, bodyY - w * 0.02, ringR, 0, Math.PI * 2);
  ctx.arc(bodyX + bodyW * 0.72, bodyY - w * 0.02, ringR, 0, Math.PI * 2);
  ctx.fill();
}

// Render to an Image (Tauri). Requires a DOM canvas → runtime only (Tauri webview).
export async function renderTrayIcon(mode, info) {
  const c = trayContent(mode, info);
  const canvas = document.createElement("canvas");
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  if (c.draw === "glyph") {
    drawGlyph(ctx, c.width, c.height);
  } else {
    const isCjk = /[一-鿿]/.test(c.text);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = isCjk
      ? `${Math.round(c.height * 0.5)}px -apple-system,"PingFang SC",sans-serif`
      : `bold ${Math.round(c.height * 0.62)}px -apple-system,Helvetica,sans-serif`;
    ctx.fillText(c.text, c.width / 2, c.height / 2 + (isCjk ? 0 : c.height * 0.02));
  }
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const { Image } = await import("@tauri-apps/api/image");
  return Image.new(new Uint8Array(data), c.width, c.height);
}
```

- [ ] **Step 4: Implement `src/utils/popupPosition.js`**

```js
// All inputs/outputs in PHYSICAL pixels.
export function computePopupPosition(rect, winSize, monitor, gap = 6) {
  const iconRight = rect.position.x + rect.size.width;
  const iconBottom = rect.position.y + rect.size.height;
  const monRight = monitor.position.x + monitor.size.width;
  const monBottom = monitor.position.y + monitor.size.height;

  let x = iconRight - winSize.width;
  let y = iconBottom + gap;

  if (x < monitor.position.x) x = monitor.position.x;
  if (x + winSize.width > monRight) x = monRight - winSize.width;

  if (y + winSize.height > monBottom) {
    y = rect.position.y - gap - winSize.height; // flip above
  }
  if (y < monitor.position.y) y = monitor.position.y;
  return { x, y };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test` → PASS.

- [ ] **Step 6: Commit (optional)**

```bash
git add src/utils src/tests/trayIcon.test.js src/tests/popupPosition.test.js
git commit -m "feat(tray): icon content descriptor and popup positioning math"
```

---

## Task 4: Calendar updates — weekStart, holidays, showLunar

**Files:**
- Modify: `src/composables/useCalendar.js`
- Modify: `src/components/DayCell.vue`
- Modify: `src/components/MonthGrid.vue`

- [ ] **Step 1: Add `weekStart` to `buildMonthMatrix` + a `weekdayHeader` helper**

In `src/composables/useCalendar.js`, replace the existing `buildMonthMatrix` and add `weekdayHeader`. Change:

```js
export function buildMonthMatrix(year, month, weekStart = 1) {
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay(); // 0=Sun..6=Sat
  // leading count so the first column matches weekStart (1=Mon, 0=Sun)
  const offset = ((dow - (weekStart === 1 ? 1 : 0)) + 7) % 7;
  const start = new Date(year, month - 1, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    cells.push({
      year: y,
      month: m,
      day: d.getDate(),
      inMonth: y === year && m === month,
      key: toKey(y, m, d.getDate()),
    });
  }
  return cells;
}

export function weekdayHeader(weekStart = 1) {
  const mon = ["一", "二", "三", "四", "五", "六", "日"];
  const sun = ["日", "一", "二", "三", "四", "五", "六"];
  return weekStart === 1 ? mon : sun;
}
```

(Leave `getDayInfo`, `shiftMonth`, `toKey`, `todayParts`, `nowHHMM`, `useCalendar` unchanged. The existing `buildMonthMatrix` tests still pass because the default `weekStart=1` reproduces Monday-based behavior.)

- [ ] **Step 2: Run existing tests to confirm no regression**

Run: `npm test`
Expected: PASS (the Monday-based assertions still hold with `weekStart=1`).

- [ ] **Step 3: Update `DayCell.vue` for holiday/workday badge + showLunar**

Replace `src/components/DayCell.vue` entirely:

```vue
<script setup>
defineProps({
  day: { type: Object, required: true },
  label: { type: String, default: "" },
  kind: { type: String, default: "lunar" }, // lunar|jieqi|festival
  isToday: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
  hasEvent: { type: Boolean, default: false },
  showLunar: { type: Boolean, default: true },
  isOffDay: { type: Boolean, default: false }, // 放假
  isMakeupWork: { type: Boolean, default: false }, // 补班
});
defineEmits(["select"]);
</script>

<template>
  <button
    class="day-cell"
    :class="{
      today: isToday,
      selected: isSelected,
      'out-month': !day.inMonth,
      off: isOffDay,
      [`kind-${kind}`]: true,
    }"
    @click="$emit('select', day.key)"
  >
    <span class="solar">{{ day.day }}</span>
    <span v-if="showLunar" class="lunar">{{ isOffDay ? label : label }}</span>
    <span v-if="isMakeupWork" class="badge ban">班</span>
    <span v-else-if="hasEvent && !isOffDay" class="dot" />
  </button>
</template>

<style scoped>
.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  color: var(--text);
}
.solar { font-size: 14px; font-weight: 500; line-height: 1.2; }
.lunar { font-size: 10px; line-height: 1.1; opacity: 0.6; }
.day-cell.kind-festival .lunar, .day-cell.kind-jieqi .lunar { color: #e8590c; opacity: 0.95; }
.day-cell.off { background: rgba(239, 68, 68, 0.10); }
.day-cell.off .lunar { color: #dc2626; opacity: 0.95; }
.day-cell.out-month { opacity: 0.3; }
.day-cell.today { background: var(--accent); color: #fff; }
.day-cell.today .lunar { color: #fff; opacity: 0.85; }
.day-cell.selected:not(.today):not(.off) { background: var(--accent-soft); }
.dot { position: absolute; bottom: 3px; width: 4px; height: 4px; border-radius: 50%; background: #ef4444; }
.day-cell.today .dot { background: #fff; }
.badge { position: absolute; top: 2px; right: 3px; font-size: 8px; line-height: 1; padding: 1px 2px; border-radius: 4px; }
.badge.ban { color: #fff; background: #f59e0b; }
</style>
```

- [ ] **Step 4: Update `MonthGrid.vue` to take a `headers` prop**

Replace `src/components/MonthGrid.vue`:

```vue
<script setup>
import DayCell from "./DayCell.vue";
defineProps({
  cells: { type: Array, required: true },
  headers: { type: Array, default: () => ["一", "二", "三", "四", "五", "六", "日"] },
  showLunar: { type: Boolean, default: true },
});
defineEmits(["select"]);
</script>

<template>
  <div class="grid">
    <div class="dow" v-for="h in headers" :key="h">{{ h }}</div>
    <DayCell
      v-for="c in cells"
      :key="c.day.key"
      :day="c.day"
      :label="c.label"
      :kind="c.kind"
      :is-today="c.isToday"
      :is-selected="c.isSelected"
      :has-event="c.hasEvent"
      :show-lunar="showLunar"
      :is-off-day="c.isOffDay"
      :is-makeup-work="c.isMakeupWork"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dow { text-align: center; font-size: 11px; opacity: 0.55; padding: 4px 0 6px; color: var(--text); }
</style>
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS (DayCell tests need updated props — see Step 6).

- [ ] **Step 6: Update `DayCell.test.js` props**

In `src/tests/DayCell.test.js`, the `baseProps` already use `day/label/kind/isToday/isSelected/hasEvent`. The new optional props default fine, so existing tests still pass without changes. (If a test asserts `.dot` absence, it still holds since `hasEvent:false`.) Run `npm test` → PASS.

- [ ] **Step 7: Commit (optional)**

```bash
git add src/composables/useCalendar.js src/components/DayCell.vue src/components/MonthGrid.vue
git commit -m "feat(calendar): weekStart option, holiday/workday badges, showLunar"
```

---

## Task 5: SettingsPanel component

**Files:**
- Create: `src/components/SettingsPanel.vue`

- [ ] **Step 1: Implement `src/components/SettingsPanel.vue`**

```vue
<script setup>
import { computed } from "vue";

const props = defineProps({
  settings: { type: Object, required: true },
});
const emit = defineEmits(["update", "close"]);

const s = computed(() => props.settings);
function set(patch) {
  emit("update", patch);
}
</script>

<template>
  <div class="settings">
    <div class="settings-head">
      <span>设置</span>
      <button class="close" @click="emit('close')" title="关闭">×</button>
    </div>

    <label class="row">
      <span class="lbl">状态栏图标</span>
      <select :value="s.trayIconMode" @change="set({ trayIconMode: $event.target.value })">
        <option value="icon">仅图标</option>
        <option value="date">公历日期</option>
        <option value="lunar">农历日期</option>
      </select>
    </label>

    <label class="row">
      <span class="lbl">每周起始日</span>
      <select :value="String(s.weekStart)" @change="set({ weekStart: Number($event.target.value) })">
        <option value="1">周一</option>
        <option value="0">周日</option>
      </select>
    </label>

    <label class="row">
      <span class="lbl">外观</span>
      <select :value="s.theme" @change="set({ theme: $event.target.value })">
        <option value="auto">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </label>

    <label class="row switch">
      <span class="lbl">显示农历</span>
      <input type="checkbox" :checked="s.showLunar" @change="set({ showLunar: $event.target.checked })" />
    </label>

    <label class="row switch">
      <span class="lbl">显示节假日</span>
      <input type="checkbox" :checked="s.showHolidays" @change="set({ showHolidays: $event.target.checked })" />
    </label>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; color: var(--text); }
.settings-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.close { border: none; background: transparent; font-size: 18px; cursor: pointer; color: var(--text); opacity: 0.6; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
.lbl { opacity: 0.85; }
select { font-family: inherit; font-size: 12px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.row.switch { cursor: pointer; }
input[type="checkbox"] { width: 16px; height: 16px; }
</style>
```

- [ ] **Step 2: Commit (optional)**

```bash
git add src/components/SettingsPanel.vue
git commit -m "feat(ui): settings panel"
```

---

## Task 6: CalendarWidget rewrite + App theming

**Files:**
- Modify: `src/components/CalendarWidget.vue` (rewrite)
- Modify: `src/App.vue` (rewrite for CSS-variable theming)

- [ ] **Step 1: Rewrite `src/components/CalendarWidget.vue`**

```vue
<script setup>
import { ref, computed, watch } from "vue";
import { useCalendar, getDayInfo, weekdayHeader } from "../composables/useCalendar";
import { useEvents } from "../composables/useEvents";
import { useHolidays } from "../composables/useHolidays";
import { useReminders } from "../composables/useReminders";
import { isHoliday, isWorkday, holidayLabel, nextHolidayFrom } from "../composables/useHolidays";
import MonthGrid from "./MonthGrid.vue";
import EventPanel from "./EventPanel.vue";
import SettingsPanel from "./SettingsPanel.vue";

const props = defineProps({
  settings: { type: Object, required: true },
});
const emit = defineEmits(["update-settings"]);

const { year, month, todayKey, matrix, prev, next, goToday } = useCalendar();
const { eventsByDate, addEvent, removeEvent } = useEvents();
const { data: holidays, refresh } = useHolidays();

const selectedKey = ref(todayKey.value);
const showSettings = ref(false);

refresh(); // best-effort online refresh

const headers = computed(() => weekdayHeader(props.settings.weekStart));

const cells = computed(() =>
  matrix.value.map((day) => {
    const cur = matrix.value; // no-op ref to keep reactivity on month nav
    void cur;
    const info = getDayInfo(day.year, day.month, day.day);
    const off = isHoliday(holidays.value, day.key);
    return {
      day,
      label: info.label,
      kind: info.kind,
      isToday: day.key === todayKey.value,
      isSelected: day.key === selectedKey.value,
      hasEvent: (eventsByDate.value[day.key] || []).length > 0,
      isOffDay: off && props.settings.showHolidays,
      isMakeupWork: isWorkday(holidays.value, day.key) && props.settings.showHolidays,
    };
  })
);

const selectedEvents = computed(() => eventsByDate.value[selectedKey.value] || []);

const nextHoliday = computed(() => {
  if (!props.settings.showHolidays) return null;
  return nextHolidayFrom(holidays.value, todayKey.value);
});

useReminders(eventsByDate);

function patchSettings(p) {
  emit("update-settings", p);
}
</script>

<template>
  <div class="widget">
    <header class="cw-header">
      <div class="brand">
        <img src="/calendar.svg" class="logo" alt="日历" />
        <span class="title">日历</span>
      </div>
      <div class="actions">
        <button class="icon-btn" @click="prev" title="上一月">‹</button>
        <span class="month">{{ year }}年 {{ month }}月</span>
        <button class="icon-btn" @click="next" title="下一月">›</button>
        <button class="icon-btn gear" @click="showSettings = !showSettings" title="设置">⚙</button>
      </div>
      <div class="sub">
        <button class="today-btn" @click="goToday">回今天</button>
        <span v-if="nextHoliday" class="next-off">距下次放假：{{ nextHoliday.daysUntil }} 天 → {{ nextHoliday.name }}</span>
      </div>
    </header>

    <MonthGrid
      :cells="cells"
      :headers="headers"
      :show-lunar="settings.showLunar"
      @select="(k) => (selectedKey = k)"
    />

    <EventPanel
      :date-key="selectedKey"
      :events="selectedEvents"
      @add="(e) => addEvent(selectedKey, e)"
      @remove="removeEvent"
    />

    <div v-if="showSettings" class="overlay">
      <SettingsPanel
        :settings="settings"
        @update="patchSettings"
        @close="showSettings = false"
      />
    </div>
  </div>
</template>

<style scoped>
.widget { display: flex; flex-direction: column; height: 100%; overflow: hidden; user-select: none; color: var(--text); background: var(--surface); border-radius: 12px; }
.cw-header { padding: 10px 12px 4px; display: flex; flex-direction: column; gap: 4px; }
.brand { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; opacity: 0.9; }
.logo { width: 16px; height: 16px; }
.actions { display: flex; align-items: center; gap: 6px; }
.month { font-size: 12px; opacity: 0.75; min-width: 92px; text-align: center; }
.sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 18px; }
.next-off { font-size: 11px; opacity: 0.7; }
.icon-btn, .today-btn { border: 1px solid var(--border); background: transparent; color: var(--text); font-family: inherit; border-radius: 6px; cursor: pointer; }
.icon-btn { width: 24px; height: 22px; font-size: 15px; line-height: 1; }
.icon-btn.gear { font-size: 13px; }
.today-btn { font-size: 11px; padding: 3px 8px; }
.icon-btn:hover, .today-btn:hover { background: var(--hover); }
:deep(.grid) { padding: 2px 10px 6px; }
.overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.25); display: flex; justify-content: center; padding-top: 40px; }
.overlay > :first-child { width: 100%; background: var(--surface); border-radius: 12px; margin: 0 8px; height: fit-content; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
</style>
```

- [ ] **Step 2: Rewrite `src/App.vue` with CSS-variable theming**

```vue
<script setup>
import { computed, watchEffect } from "vue";
import CalendarWidget from "./components/CalendarWidget.vue";
import { useSettings } from "./composables/useSettings";

const { settings, update } = useSettings();

watchEffect(() => {
  const t = settings.value.theme;
  const resolved = t === "auto" ? null : t;
  if (resolved) document.documentElement.setAttribute("data-theme", resolved);
  else document.documentElement.removeAttribute("data-theme");
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
    --border: rgba(255, 255, 255, 0.18);
    --hover: rgba(255, 255, 255, 0.1);
    --accent: #3b82f6;
    --accent-soft: rgba(59, 130, 246, 0.2);
  }
}
:root[data-theme="dark"] {
  --text: #e5e7eb;
  --surface: #1f1f24;
  --border: rgba(255, 255, 255, 0.18);
  --hover: rgba(255, 255, 255, 0.1);
  --accent: #3b82f6;
  --accent-soft: rgba(59, 130, 246, 0.2);
}
html, body, #app { margin: 0; padding: 0; height: 100%; background: transparent; }
body { background-color: transparent; }
.app { height: 100vh; }
</style>
```

- [ ] **Step 3: Run tests + build**

Run: `npm test` → PASS.
Run: `npm run build` → builds cleanly.

- [ ] **Step 4: Commit (optional)**

```bash
git add src/components/CalendarWidget.vue src/App.vue
git commit -m "feat(ui): frameless widget with settings, holidays, theming"
```

---

## Task 7: Tray + popup behavior (`useTray`)

**Files:**
- Create: `src/composables/useTray.js`
- Modify: `src/App.vue` (mount useTray)

- [ ] **Step 1: Implement `src/composables/useTray.js`**

```js
import { onUnmounted, watch } from "vue";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow, } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { renderTrayIcon } from "../utils/trayIcon";
import { computePopupPosition } from "../utils/popupPosition";
import { getDayInfo, todayParts } from "./useCalendar";

const TRAY_ID = "calendar";

export function useTray(settingsRef, dayInfo = () => getDayInfo(...Object.values(todayParts()))) {
  let tray = null;
  let unlistenFocus = null;
  let dayTimer = null;
  let suppressBlurOnce = false;

  async function updateIcon() {
    if (!tray) return;
    try {
      const t = todayParts();
      const info = getDayInfo(t.year, t.month, t.day);
      const img = await renderTrayIcon(settingsRef.value.trayIconMode, {
        solarDay: t.day,
        lunarDay: info.lunarDay,
      });
      await tray.setIcon(img);
      await tray.setIconAsTemplate(true);
    } catch {
      /* not in tauri */
    }
  }

  async function positionAndShow(rect) {
    const w = getCurrentWindow();
    const [winSize, mon] = await Promise.all([w.outerSize(), w.currentMonitor()]);
    if (!winSize || !mon) {
      await w.show();
      return;
    }
    const p = computePopupPosition(rect, winSize, mon);
    suppressBlurOnce = true;
    await w.setPosition(new PhysicalPosition(p.x, p.y));
    await w.show();
    await w.setFocus();
  }

  async function onTrayEvent(event) {
    if (event.type !== "Click" || event.button !== "Left") return;
    const w = getCurrentWindow();
    try {
      if (await w.isVisible()) {
        await w.hide();
      } else {
        await positionAndShow(event.rect);
      }
    } catch {
      /* ignore */
    }
  }

  async function init() {
    try {
      tray = await TrayIcon.new({
        id: TRAY_ID,
        tooltip: "日历",
        iconAsTemplate: true,
        action: onTrayEvent,
      });
      await updateIcon();
      unlistenFocus = await getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
        if (suppressBlurOnce) { suppressBlurOnce = false; return; }
        if (!focused) {
          try { await getCurrentWindow().hide(); } catch { /* ignore */ }
        }
      });
      // Esc to dismiss
      window.addEventListener("keydown", onKeydown);
      // day rollover refresh + icon refresh when mode changes
      watch(() => settingsRef.value.trayIconMode, updateIcon);
      dayTimer = setInterval(updateIcon, 60 * 1000);
    } catch {
      /* not in tauri (vitest / plain browser): no-op */
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      getCurrentWindow().hide().catch(() => {});
    }
  }

  init();

  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    if (unlistenFocus) unlistenFocus();
    if (dayTimer) clearInterval(dayTimer);
  });
}
```

- [ ] **Step 2: Mount `useTray` in `App.vue`**

In `src/App.vue`, add the import and call. Update the `<script setup>`:

```vue
<script setup>
import { computed, watchEffect } from "vue";
import CalendarWidget from "./components/CalendarWidget.vue";
import { useSettings } from "./composables/useSettings";
import { useTray } from "./composables/useTray";

const { settings, update } = useSettings();

watchEffect(() => {
  const t = settings.value.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
});

useTray(settings);
</script>
```

(Template unchanged.)

- [ ] **Step 3: Run tests + build**

Run: `npm test` → PASS.
Run: `npm run build` → builds cleanly (the dynamic Tauri imports are runtime-only).

- [ ] **Step 4: Commit (optional)**

```bash
git add src/composables/useTray.js src/App.vue
git commit -m "feat(tray): status bar tray, popup positioning, blur/esc dismiss"
```

---

## Task 8: Tauri config, Rust activation policy, capabilities

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Change the window to a frameless hidden popup**

In `src-tauri/tauri.conf.json`, replace the `"windows"` block with:

```json
"windows": [
  {
    "label": "main",
    "title": "日历",
    "width": 340,
    "height": 460,
    "resizable": false,
    "decorations": false,
    "transparent": true,
    "visible": false,
    "skipTaskbar": true,
    "alwaysOnTop": true,
    "acceptFirstMouse": true,
    "shadow": false
  }
],
```

And add `"macOSPrivateApi": true` inside `"app"` (required for transparent windows on macOS). The `"app"` block becomes:

```json
"app": {
  "macOSPrivateApi": true,
  "windows": [ ... ],
  "security": { "csp": null }
}
```

- [ ] **Step 2: Add the `image-png` feature to `tauri`**

In `src-tauri/Cargo.toml`, change the `tauri` dependency line:

```toml
tauri = { version = "2", features = ["image-png", "macos-private-api", "tray-icon"] }
```

- [ ] **Step 3: Hide the Dock (accessory app) in `src-tauri/src/lib.rs`**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Add tray + window permissions**

In `src-tauri/capabilities/default.json`, set `permissions` to:

```json
"permissions": [
  "core:default",
  "opener:default",
  "notification:default",
  "core:window:allow-start-dragging",
  "core:tray:default",
  "core:tray:allow-set-icon",
  "core:tray:allow-set-icon-as-template",
  "core:window:allow-show",
  "core:window:allow-hide",
  "core:window:allow-set-position",
  "core:window:allow-set-focus",
  "core:window:allow-current-monitor",
  "core:window:allow-outer-size",
  "core:window:allow-scale-factor",
  "core:window:allow-is-visible"
]
```

- [ ] **Step 5: Verify Rust + config compile**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished` with no errors. If a permission identifier is reported unknown, remove it (the compiler lists valid ones).

- [ ] **Step 6: Commit (optional)**

```bash
git add src-tauri tauri.conf.json
git commit -m "feat(tauri): frameless hidden popup, accessory app, tray/window perms"
```

---

## Task 9: Build, install, manual verify

**Files:** none (verification).

- [ ] **Step 1: Production build**

Run: `npm run tauri build`
Expected: bundles `日历.app` and a `.dmg` under `src-tauri/target/release/bundle/`.

- [ ] **Step 2: Quit any running instance, install to /Applications**

Run:
```bash
osascript -e 'quit app "日历"' 2>/dev/null || true
sleep 1
rm -rf "/Applications/日历.app"
ditto "src-tauri/target/release/bundle/macos/日历.app" "/Applications/日历.app"
open "/Applications/日历.app"
```
Expected: no Dock icon appears; a calendar icon shows in the menu bar.

- [ ] **Step 3: Verify tray behavior**

- Click the menu-bar icon → popup appears just below it, right-aligned, within screen.
- Click again → hides. Click another app while open → hides (blur).
- Press Esc while open → hides.

- [ ] **Step 4: Verify calendar + holidays**

- Today highlighted; lunar labels show; 放假 days tinted with holiday name; 补班 weekends show orange "班".
- Footer "距下次放假：N 天 → <name>" appears.
- Switch 周一起始日 / 周日起始日 → grid header + columns reorder.
- Toggle 显示农历 / 显示节假日 → marks update live.

- [ ] **Step 5: Verify settings → tray icon**

- Set 状态栏图标 = 公历日期 → menu bar shows today's day number.
- = 农历日期 → shows lunar day text.
- = 仅图标 → calendar glyph.
- All three render dark/light correctly (template auto-invert). Wait past midnight (or restart next day) → number updates.

- [ ] **Step 6: Verify theme**

- 外观 = 浅色 / 深色 / 跟随系统 → popup recolors immediately.

- [ ] **Step 7: Final test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 8: Commit (optional)**

```bash
git add -A
git commit -m "chore: menubar calendar + holidays complete"
```

---

## Self-Review Notes

- **Spec coverage:** menu-bar accessory + frameless popup (Tasks 7, 8) ✓; tray click→positioned popup + blur/Esc dismiss (Task 7) ✓; configurable tray icon icon/date/lunar (Tasks 3, 7) ✓; settings tray mode + weekStart + theme + showLunar + showHolidays (Tasks 2, 5, 6) ✓; holidays bundled + online refresh + 放假/补班/距下次放假 (Tasks 1, 4, 6) ✓; capabilities (Task 8) ✓; testing (Tasks 1–4) + manual (Task 9) ✓.
- **Type consistency:** `useHolidays` exports `parseHolidays/isHoliday/isWorkday/holidayLabel/nextHolidayFrom` consumed identically in Task 6. `trayContent`/`renderTrayIcon` and `computePopupPosition` signatures match between Tasks 3 and 7. Settings keys (`trayIconMode/weekStart/theme/showLunar/showHolidays`) match across Tasks 2, 5, 6, 7. DayCell props (`isOffDay/isMakeupWork/showLunar`) match MonthGrid (Task 4) and CalendarWidget (Task 6).
- **Placeholders:** none — every code step contains full source.
- **Known runtime-only gaps (not unit-tested, covered by Task 9 manual):** `renderTrayIcon` canvas pixel output (jsdom has no canvas), tray/popup Tauri calls, activation policy effect.
```
