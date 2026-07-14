# 日历挂件 (Calendar Widget) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tauri+Vue greeting demo with a macOS desktop calendar widget showing solar + lunar dates, festivals/solar terms, per-day events (localStorage), and in-app system notifications.

**Architecture:** Vue 3 `<script setup>` frontend composed of small components + pure composable helpers (tested with Vitest). Tauri 2 only provides the frameless-overlay window + notification plugin. All calendar/event logic lives in the frontend.

**Tech Stack:** Tauri 2, Vue 3, Vite 6, `lunar-javascript` (lunar/festivals/jieqi), `@tauri-apps/plugin-notification`, Vitest + `@vue/test-utils` + jsdom, `@resvg/resvg-js` (icon rasterization).

**Prerequisite note (git):** This project is currently **not** a git repository. Commit steps below are optional checkpoints. If you want version tracking, run `git init` once before starting; otherwise skip every `git add`/`git commit` step.

**Verified external APIs (exact):**
- `lunar-javascript`: `import { Solar } from 'lunar-javascript'` → `Solar.fromYmd(y,m,d)`, `.getLunar()`, `lunar.getJieQi()` (`""` or name), `lunar.getFestivals()` / `solar.getFestivals()` / `lunar.getOtherFestivals()` (arrays), `lunar.getDayInChinese()` (e.g. `"廿七"`).
- `@tauri-apps/plugin-notification`: `isPermissionGranted()`, `requestPermission()` (→ `"granted"`/`"denied"`), `sendNotification({title, body})`. Rust: `.plugin(tauri_plugin_notification::init())`. Capability permission: `"notification:default"` (singular — verified via `cargo check`).

---

## File Structure

**Create:**
- `vitest.config.js` — Vitest config (jsdom + vue plugin), separate from Tauri-tailored `vite.config.js`.
- `src/composables/useCalendar.js` — pure date helpers + `useCalendar()` composable (matrix, prev/next, today, lunar labels).
- `src/composables/useEvents.js` — pure event CRUD helpers + `useEvents()` composable (localStorage).
- `src/composables/useReminders.js` — pure `getDueEvents()` + `useReminders()` composable (interval + notification).
- `src/components/DayCell.vue` — one day cell (solar + lunar label + dot + states).
- `src/components/MonthGrid.vue` — weekday header + 42 DayCells.
- `src/components/EventPanel.vue` — selected day's events + add/remove form.
- `src/components/CalendarWidget.vue` — orchestrator: state, header (lights-aware), grid, panel.
- `src/tests/useCalendar.test.js`, `src/tests/useEvents.test.js`, `src/tests/useReminders.test.js`, `src/tests/DayCell.test.js`.
- `src-tauri/icons-src/icon.svg`, `src-tauri/icons-src/rasterize.mjs` — icon source + rasterizer.

**Modify:**
- `package.json` — add deps + `test` scripts.
- `src/App.vue` — replace greeting demo with widget shell.
- `index.html` — title + favicon.
- `public/` — add `calendar.svg` (favicon/logo).
- `src-tauri/tauri.conf.json` — window: 360×460, overlay title bar, always-on-top, not resizable.
- `src-tauri/Cargo.toml` — add `tauri-plugin-notification`.
- `src-tauri/src/lib.rs` — register notification plugin, remove `greet`.
- `src-tauri/capabilities/default.json` — add `notifications:default`.

---

## Task 1: Install dependencies & test setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm i lunar-javascript @tauri-apps/plugin-notification
```
Expected: both packages added to `dependencies`.

- [ ] **Step 2: Install dev deps (tests + icon rasterization)**

Run:
```bash
npm i -D vitest @vue/test-utils jsdom @resvg/resvg-js
```
Expected: packages added to `devDependencies`.

- [ ] **Step 3: Add test scripts to `package.json`**

Edit `package.json` `scripts` to:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 4: Create `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 5: Verify Vitest runs (no tests yet → exits 0)**

Run: `npm test`
Expected: `No test files found` and exit code 0 (or 1 depending on vitest — if it errors on "no tests", continue; Task 2 adds real tests).

- [ ] **Step 6: Commit (optional)**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore: add calendar widget deps and vitest setup"
```

---

## Task 2: Calendar date logic (TDD) — `useCalendar.js`

**Files:**
- Create: `src/composables/useCalendar.js`
- Test: `src/tests/useCalendar.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/useCalendar.test.js`:
```js
import { describe, it, expect } from "vitest";
import {
  toKey,
  shiftMonth,
  buildMonthMatrix,
  getDayInfo,
} from "../composables/useCalendar";

describe("toKey", () => {
  it("zero-pads month and day", () => {
    expect(toKey(2026, 7, 9)).toBe("2026-07-09");
    expect(toKey(2026, 12, 5)).toBe("2026-12-05");
  });
});

describe("shiftMonth", () => {
  it("wraps previous year", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("wraps next year", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
  it("shifts within a year", () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
  });
});

describe("buildMonthMatrix", () => {
  const cells = buildMonthMatrix(2026, 7); // July 2026 has 31 days
  it("returns 42 cells", () => {
    expect(cells).toHaveLength(42);
  });
  it("first cell is a Monday", () => {
    const c = cells[0];
    const wd = new Date(c.year, c.month - 1, c.day).getDay();
    expect((wd + 6) % 7).toBe(0); // Monday-based
  });
  it("contains exactly the month's in-month days 1..31", () => {
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth.map((c) => c.day).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1)
    );
  });
  it("every cell has a zero-padded key", () => {
    expect(cells[0].key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getDayInfo (lunar/festival/jieqi)", () => {
  it("solar festival 劳动节 wins (2019-05-01)", () => {
    const info = getDayInfo(2019, 5, 1);
    expect(info.festivals).toContain("劳动节");
    expect(info.label).toBe("劳动节");
    expect(info.kind).toBe("festival");
  });
  it("jieqi 冬至 when no festival (2021-12-21)", () => {
    const info = getDayInfo(2021, 12, 21);
    expect(info.jieqi).toBe("冬至");
    expect(info.label).toBe("冬至");
    expect(info.kind).toBe("jieqi");
  });
  it("falls back to lunar day name otherwise (2019-05-02)", () => {
    const info = getDayInfo(2019, 5, 2);
    expect(info.kind).toBe("lunar");
    expect(info.label).toBe(info.lunarDay);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../composables/useCalendar'`.

- [ ] **Step 3: Implement `src/composables/useCalendar.js`**

```js
import { ref, computed } from "vue";
import { Solar } from "lunar-javascript";

function pad(n) {
  return String(n).padStart(2, "0");
}

export function toKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayParts() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function buildMonthMatrix(year, month) {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-based leading days
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

export function getDayInfo(year, month, day) {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const jieqi = lunar.getJieQi();
  const festivals = [
    ...solar.getFestivals(),
    ...lunar.getFestivals(),
    ...lunar.getOtherFestivals(),
  ];
  const lunarDay = lunar.getDayInChinese();
  let label = lunarDay;
  let kind = "lunar";
  if (jieqi) {
    label = jieqi;
    kind = "jieqi";
  }
  if (festivals.length) {
    label = festivals[0];
    kind = "festival";
  }
  return { label, kind, jieqi, festivals, lunarDay };
}

export function useCalendar() {
  const t = todayParts();
  const year = ref(t.year);
  const month = ref(t.month);
  const todayKey = computed(() => toKey(t.year, t.month, t.day));
  const matrix = computed(() => buildMonthMatrix(year.value, month.value));
  function prev() {
    const s = shiftMonth(year.value, month.value, -1);
    year.value = s.year;
    month.value = s.month;
  }
  function next() {
    const s = shiftMonth(year.value, month.value, 1);
    year.value = s.year;
    month.value = s.month;
  }
  function goToday() {
    year.value = t.year;
    month.value = t.month;
  }
  return { year, month, todayKey, matrix, prev, next, goToday, getDayInfo };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `useCalendar` tests green.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/composables/useCalendar.js src/tests/useCalendar.test.js
git commit -m "feat(calendar): add date matrix and lunar/jieqi/festival logic"
```

---

## Task 3: Events storage (TDD) — `useEvents.js`

**Files:**
- Create: `src/composables/useEvents.js`
- Test: `src/tests/useEvents.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/useEvents.test.js`:
```js
import { describe, it, expect } from "vitest";
import {
  loadEvents,
  saveEvents,
  withEventAdded,
  withEventRemoved,
} from "../composables/useEvents";

function memStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    _store: store,
  };
}

describe("loadEvents / saveEvents", () => {
  it("returns {} when empty", () => {
    expect(loadEvents(memStorage())).toEqual({});
  });
  it("returns {} on corrupt JSON", () => {
    expect(loadEvents(memStorage({ "calendar:events": "not json" }))).toEqual({});
  });
  it("round-trips data", () => {
    const s = memStorage();
    saveEvents(s, { "2026-07-09": [{ id: "1", title: "x", time: "09:00", notify: false }] });
    expect(loadEvents(s)["2026-07-09"]).toHaveLength(1);
  });
});

describe("withEventAdded", () => {
  it("adds an event with a generated id under the date key", () => {
    const next = withEventAdded({}, "2026-07-09", { title: "开会", time: "09:30", notify: true });
    expect(next["2026-07-09"]).toHaveLength(1);
    expect(next["2026-07-09"][0].id).toBeTruthy();
    expect(next["2026-07-09"][0].title).toBe("开会");
  });
  it("does not mutate input", () => {
    const input = { "2026-07-09": [{ id: "a", title: "x", time: "09:00", notify: false }] };
    withEventAdded(input, "2026-07-09", { title: "y", time: "10:00", notify: false });
    expect(input["2026-07-09"]).toHaveLength(1);
  });
});

describe("withEventRemoved", () => {
  it("removes by id and drops empty date keys", () => {
    const data = {
      "2026-07-09": [
        { id: "a", title: "x", time: "09:00", notify: false },
        { id: "b", title: "y", time: "10:00", notify: false },
      ],
    };
    const next = withEventRemoved(data, "a");
    expect(next["2026-07-09"]).toHaveLength(1);
    expect(next["2026-07-09"][0].id).toBe("b");
    const emptied = withEventRemoved(next, "b");
    expect(emptied["2026-07-09"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/composables/useEvents.js`**

```js
import { ref, watch } from "vue";

const STORAGE_KEY = "calendar:events";

function genId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export function loadEvents(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveEvents(storage, data) {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function withEventAdded(data, key, event) {
  const next = { ...data };
  const list = (next[key] || []).slice();
  list.push({ id: genId(), ...event });
  next[key] = list;
  return next;
}

export function withEventRemoved(data, id) {
  const next = {};
  for (const k of Object.keys(data)) {
    const filtered = data[k].filter((e) => e.id !== id);
    if (filtered.length) next[k] = filtered;
  }
  return next;
}

export function useEvents(storage = localStorage) {
  const eventsByDate = ref(loadEvents(storage));
  watch(
    eventsByDate,
    (v) => saveEvents(storage, v),
    { deep: true }
  );
  function addEvent(key, event) {
    eventsByDate.value = withEventAdded(eventsByDate.value, key, event);
  }
  function removeEvent(id) {
    eventsByDate.value = withEventRemoved(eventsByDate.value, id);
  }
  return { eventsByDate, addEvent, removeEvent };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/composables/useEvents.js src/tests/useEvents.test.js
git commit -m "feat(events): add localStorage-backed event storage with tests"
```

---

## Task 4: Reminder due-check (TDD) — `useReminders.js`

**Files:**
- Create: `src/composables/useReminders.js`
- Test: `src/tests/useReminders.test.js`

- [ ] **Step 1: Write the failing test (pure function only)**

Create `src/tests/useReminders.test.js`:
```js
import { describe, it, expect } from "vitest";
import { getDueEvents } from "../composables/useReminders";

const events = [
  { id: "1", title: "晨会", time: "09:00", notify: true },
  { id: "2", title: "下午会", time: "14:00", notify: true },
  { id: "3", title: "静默", time: "09:00", notify: false },
];

describe("getDueEvents", () => {
  it("fires events whose time is within [sessionStart, now]", () => {
    const due = getDueEvents(events, "10:00", "08:00", new Set());
    expect(due.map((e) => e.id)).toEqual(["1"]); // 09:00 in window; 14:00 not yet
  });
  it("skips events already fired", () => {
    const due = getDueEvents(events, "10:00", "08:00", new Set(["1"]));
    expect(due).toHaveLength(0);
  });
  it("skips events earlier than session start (no stale catch-up on open)", () => {
    const due = getDueEvents(events, "10:00", "09:30", new Set());
    expect(due.map((e) => e.id)).toEqual([]); // 09:00 < sessionStart 09:30
  });
  it("never includes non-notify events", () => {
    const due = getDueEvents(events, "10:00", "08:00", new Set());
    expect(due.find((e) => e.id === "3")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/composables/useReminders.js`**

```js
import { onUnmounted } from "vue";
import { toKey, todayParts, nowHHMM } from "./useCalendar";

export function getDueEvents(todayEvents, now, sessionStart, fired) {
  return todayEvents.filter(
    (e) =>
      e.notify &&
      e.time >= sessionStart &&
      e.time <= now &&
      !fired.has(e.id)
  );
}

async function fireNotification(event) {
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) {
      const perm = await mod.requestPermission();
      granted = perm === "granted";
    }
    if (!granted) return;
    mod.sendNotification({ title: "日历提醒", body: `${event.title} · ${event.time}` });
  } catch {
    // Not in Tauri (e.g. plain Vite/vitest): ignore.
  }
}

function defaultTodayKey() {
  const t = todayParts();
  return toKey(t.year, t.month, t.day);
}

export function useReminders(
  eventsByDate,
  { getNow = nowHHMM, getTodayKey = defaultTodayKey, intervalMs = 60_000 } = {}
) {
  const fired = new Set();
  const sessionStart = getNow();

  async function check() {
    const list = eventsByDate.value[getTodayKey()] || [];
    const due = getDueEvents(list, getNow(), sessionStart, fired);
    for (const e of due) {
      fired.add(e.id);
      await fireNotification(e);
    }
  }

  check();
  const timer = setInterval(check, intervalMs);
  onUnmounted(() => clearInterval(timer));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/composables/useReminders.js src/tests/useReminders.test.js
git commit -m "feat(reminders): add due-event check and notification firing"
```

---

## Task 5: DayCell component (TDD)

**Files:**
- Create: `src/components/DayCell.vue`
- Test: `src/tests/DayCell.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/DayCell.test.js`:
```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DayCell from "../components/DayCell.vue";

const baseProps = {
  day: { day: 9, inMonth: true, key: "2026-07-09" },
  label: "十五",
  kind: "lunar",
  isToday: false,
  isSelected: false,
  hasEvent: false,
};

describe("DayCell", () => {
  it("renders solar day and lunar label", () => {
    const w = mount(DayCell, { props: baseProps });
    expect(w.text()).toContain("9");
    expect(w.text()).toContain("十五");
  });
  it("shows event dot only when hasEvent", () => {
    expect(mount(DayCell, { props: baseProps }).find(".dot").exists()).toBe(false);
    expect(
      mount(DayCell, { props: { ...baseProps, hasEvent: true } }).find(".dot").exists()
    ).toBe(true);
  });
  it("applies today/selected classes", () => {
    const w = mount(DayCell, { props: { ...baseProps, isToday: true, isSelected: true } });
    expect(w.classes()).toContain("today");
    expect(w.classes()).toContain("selected");
  });
  it("emits select with the day key on click", async () => {
    const w = mount(DayCell, { props: baseProps });
    await w.trigger("click");
    expect(w.emitted("select")[0]).toEqual(["2026-07-09"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/components/DayCell.vue`**

```vue
<script setup>
defineProps({
  day: { type: Object, required: true },
  label: { type: String, default: "" },
  kind: { type: String, default: "lunar" },
  isToday: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
  hasEvent: { type: Boolean, default: false },
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
      [`kind-${kind}`]: true,
    }"
    @click="$emit('select', day.key)"
  >
    <span class="solar">{{ day.day }}</span>
    <span class="lunar">{{ label }}</span>
    <span v-if="hasEvent" class="dot" />
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
  color: inherit;
}
.solar {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
}
.lunar {
  font-size: 10px;
  line-height: 1.1;
  opacity: 0.6;
}
.day-cell.kind-festival .lunar,
.day-cell.kind-jieqi .lunar {
  color: #e8590c;
  opacity: 0.95;
}
.day-cell.out-month {
  opacity: 0.3;
}
.day-cell.today {
  background: #2563eb;
  color: #fff;
}
.day-cell.today .lunar {
  color: #fff;
  opacity: 0.85;
}
.day-cell.selected:not(.today) {
  background: rgba(37, 99, 235, 0.15);
}
.dot {
  position: absolute;
  bottom: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #ef4444;
}
.day-cell.today .dot {
  background: #fff;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/components/DayCell.vue src/tests/DayCell.test.js
git commit -m "feat(ui): add DayCell component with lunar label and states"
```

---

## Task 6: MonthGrid component

**Files:**
- Create: `src/components/MonthGrid.vue`

- [ ] **Step 1: Implement `src/components/MonthGrid.vue`**

```vue
<script setup>
import DayCell from "./DayCell.vue";

defineProps({
  cells: { type: Array, required: true }, // 42 enriched cell objects
});
defineEmits(["select"]);

const headers = ["一", "二", "三", "四", "五", "六", "日"];
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
      @select="$emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.dow {
  text-align: center;
  font-size: 11px;
  opacity: 0.55;
  padding: 4px 0 6px;
}
</style>
```

- [ ] **Step 2: Commit (optional)**

```bash
git add src/components/MonthGrid.vue
git commit -m "feat(ui): add MonthGrid with Monday-based weekday header"
```

---

## Task 7: EventPanel component

**Files:**
- Create: `src/components/EventPanel.vue`

- [ ] **Step 1: Implement `src/components/EventPanel.vue`**

```vue
<script setup>
import { ref } from "vue";

defineProps({
  dateKey: { type: String, default: "" },
  events: { type: Array, default: () => [] },
});
const emit = defineEmits(["add", "remove"]);

const title = ref("");
const time = ref("09:00");
const notify = ref(false);

function submit() {
  if (!title.value.trim() || !time.value) return;
  emit("add", { title: title.value.trim(), time: time.value, notify: notify.value });
  title.value = "";
  notify.value = false;
}
</script>

<template>
  <div class="event-panel">
    <div class="event-list">
      <div v-for="e in events" :key="e.id" class="event-item">
        <span class="time">{{ e.time }}</span>
        <span class="evt-title">{{ e.title }}</span>
        <span v-if="e.notify" class="bell">🔔</span>
        <button class="del" title="删除" @click="emit('remove', e.id)">×</button>
      </div>
      <div v-if="!events.length" class="empty">这一天还没有事件</div>
    </div>

    <form class="event-form" @submit.prevent="submit">
      <input v-model="title" class="title-input" placeholder="事件标题" />
      <input v-model="time" class="time-input" type="time" />
      <label class="notify"><input type="checkbox" v-model="notify" />提醒</label>
      <button type="submit" class="add-btn">添加</button>
    </form>
  </div>
</template>

<style scoped>
.event-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 14px;
  border-top: 1px solid rgba(127, 127, 127, 0.18);
}
.event-list {
  min-height: 48px;
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.event-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 3px 2px;
  border-radius: 6px;
}
.event-item:hover {
  background: rgba(127, 127, 127, 0.1);
}
.time {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  min-width: 42px;
}
.evt-title {
  flex: 1;
}
.del {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.del:hover {
  opacity: 1;
  color: #ef4444;
}
.empty {
  font-size: 12px;
  opacity: 0.45;
  text-align: center;
  padding: 12px 0;
}
.event-form {
  display: flex;
  align-items: center;
  gap: 6px;
}
.title-input {
  flex: 1;
  min-width: 0;
}
.time-input {
  width: 78px;
}
.title-input,
.time-input {
  padding: 5px 8px;
  font-size: 12px;
  font-family: inherit;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  background: transparent;
  color: inherit;
}
.notify {
  font-size: 12px;
  white-space: nowrap;
  opacity: 0.85;
}
.add-btn {
  padding: 5px 10px;
  font-size: 12px;
  font-family: inherit;
  border-radius: 6px;
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.add-btn:hover {
  background: #1d4ed8;
}
</style>
```

- [ ] **Step 2: Commit (optional)**

```bash
git add src/components/EventPanel.vue
git commit -m "feat(ui): add EventPanel for per-day events"
```

---

## Task 8: CalendarWidget + App shell

**Files:**
- Create: `src/components/CalendarWidget.vue`
- Modify: `src/App.vue` (rewrite)

- [ ] **Step 1: Implement `src/components/CalendarWidget.vue`**

```vue
<script setup>
import { ref, computed } from "vue";
import { useCalendar, getDayInfo } from "../composables/useCalendar";
import { useEvents } from "../composables/useEvents";
import { useReminders } from "../composables/useReminders";
import MonthGrid from "./MonthGrid.vue";
import EventPanel from "./EventPanel.vue";

const { year, month, todayKey, matrix, prev, next, goToday } = useCalendar();
const { eventsByDate, addEvent, removeEvent } = useEvents();

const selectedKey = ref(todayKey.value);

const cells = computed(() =>
  matrix.value.map((day) => {
    const info = getDayInfo(day.year, day.month, day.day);
    return {
      day,
      label: info.label,
      kind: info.kind,
      isToday: day.key === todayKey.value,
      isSelected: day.key === selectedKey.value,
      hasEvent: (eventsByDate.value[day.key] || []).length > 0,
    };
  })
);

const selectedEvents = computed(() => eventsByDate.value[selectedKey.value] || []);

useReminders(eventsByDate);
</script>

<template>
  <div class="widget">
    <header class="cw-header" data-tauri-drag-region>
      <div class="row top">
        <div class="brand">
          <img src="/calendar.svg" class="logo" alt="日历" />
          <span>日历</span>
        </div>
        <div class="nav">
          <button class="nav-btn" @click="prev" title="上一月">‹</button>
          <button class="nav-btn" @click="next" title="下一月">›</button>
        </div>
      </div>
      <div class="row mid">
        <span class="month-title">{{ year }}年 {{ month }}月</span>
        <button class="today-btn" @click="goToday">回今天</button>
      </div>
    </header>

    <MonthGrid :cells="cells" @select="(k) => (selectedKey = k)" />

    <EventPanel
      :date-key="selectedKey"
      :events="selectedEvents"
      @add="(e) => addEvent(selectedKey, e)"
      @remove="removeEvent"
    />
  </div>
</template>

<style scoped>
.widget {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  user-select: none;
}
.cw-header {
  padding: 10px 14px 6px 78px; /* left room for macOS traffic lights */
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.9;
}
.logo {
  width: 18px;
  height: 18px;
}
.nav {
  display: flex;
  gap: 2px;
}
.nav-btn,
.today-btn {
  border: 1px solid rgba(127, 127, 127, 0.3);
  background: transparent;
  color: inherit;
  font-family: inherit;
  border-radius: 6px;
  cursor: pointer;
}
.nav-btn {
  width: 24px;
  height: 22px;
  font-size: 15px;
  line-height: 1;
}
.today-btn {
  font-size: 11px;
  padding: 3px 8px;
}
.nav-btn:hover,
.today-btn:hover {
  background: rgba(127, 127, 127, 0.15);
}
.month-title {
  font-size: 12px;
  opacity: 0.7;
}
:deep(.grid) {
  padding: 4px 10px 8px;
}
</style>
```

- [ ] **Step 2: Rewrite `src/App.vue`**

Replace the entire file with:
```vue
<script setup>
import CalendarWidget from "./components/CalendarWidget.vue";
</script>

<template>
  <div class="app">
    <CalendarWidget />
  </div>
</template>

<style>
:root {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei",
    Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #1f2937;
  background-color: #ffffff;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

.app {
  height: 100vh;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #e5e7eb;
    background-color: #1f1f24;
  }
}
</style>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all unit/component tests still green.

- [ ] **Step 4: Run the frontend in the browser to sanity-check layout**

Run: `npm run dev`
Open the printed localhost URL. Expected: a calendar grid renders (lunar labels visible), navigation works, events can be added/removed and persist on reload. Notifications won't fire here (no Tauri) — that's expected. Stop the server when done.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/components/CalendarWidget.vue src/App.vue
git commit -m "feat(ui): assemble CalendarWidget and App shell"
```

---

## Task 9: Tauri config — overlay window + notification plugin

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `index.html`

- [ ] **Step 1: Update window config in `src-tauri/tauri.conf.json`**

Replace the `"windows"` block (currently `title`, `width`, `height`) with:
```json
"windows": [
  {
    "title": "日历",
    "width": 360,
    "height": 460,
    "resizable": false,
    "alwaysOnTop": true,
    "hiddenTitle": true,
    "titleBarStyle": "Overlay"
  }
],
```
Leave the rest of the file (`build`, `security`, `bundle`, `productName`, etc.) unchanged.

- [ ] **Step 2: Add the notification plugin to `src-tauri/Cargo.toml`**

In the `[dependencies]` section, add:
```toml
tauri-plugin-notification = "2"
```
(after the existing `tauri-plugin-opener = "2"` line is fine).

- [ ] **Step 3: Register the plugin + drop `greet` in `src-tauri/src/lib.rs`**

Replace the entire file with:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Add notification capability in `src-tauri/capabilities/default.json`**

Change the `permissions` array to:
```json
"permissions": [
  "core:default",
  "opener:default",
  "notification:default"
],
```

- [ ] **Step 5: Update `index.html` title + favicon**

Replace the `<title>` line and the favicon `<link>` line with:
```html
<link rel="icon" type="image/svg+xml" href="/calendar.svg" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>日历</title>
```

- [ ] **Step 6: Build the Tauri app to confirm Rust compiles & config is valid**

Run: `npm run tauri build` (this also rebuilds icons).
Expected: compiles successfully (may be slow first time). If you only want a faster check, run `npm run tauri dev` and confirm the overlay window with native traffic lights appears.

- [ ] **Step 7: Commit (optional)**

```bash
git add src-tauri tauri.conf.json index.html
git commit -m "feat(tauri): overlay widget window and notification plugin"
```

---

## Task 10: Redesign app icons

**Files:**
- Create: `src-tauri/icons-src/icon.svg`
- Create: `src-tauri/icons-src/rasterize.mjs`
- Create: `public/calendar.svg`
- Regenerate: `src-tauri/icons/*`

- [ ] **Step 1: Create the icon source SVG**

Create `src-tauri/icons-src/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <rect x="300" y="96" width="44" height="150" rx="22" fill="#1E3A8A"/>
  <rect x="680" y="96" width="44" height="150" rx="22" fill="#1E3A8A"/>
  <rect x="180" y="220" width="664" height="640" rx="72" fill="#ffffff"/>
  <rect x="180" y="220" width="664" height="150" rx="72" fill="#1E3A8A"/>
  <rect x="180" y="320" width="664" height="50" fill="#1E3A8A"/>
  <g fill="#BFDBFE">
    <circle cx="300" cy="500" r="30"/>
    <circle cx="430" cy="500" r="30"/>
    <circle cx="560" cy="500" r="30"/>
    <circle cx="690" cy="500" r="30"/>
    <circle cx="300" cy="640" r="30"/>
    <circle cx="430" cy="640" r="30"/>
    <circle cx="690" cy="640" r="30"/>
    <circle cx="300" cy="780" r="30"/>
    <circle cx="430" cy="780" r="30"/>
    <circle cx="560" cy="780" r="30"/>
    <circle cx="690" cy="780" r="30"/>
  </g>
  <circle cx="560" cy="640" r="74" fill="#EF4444"/>
  <text x="560" y="668" font-family="-apple-system, Helvetica, Arial, sans-serif"
        font-size="78" font-weight="700" fill="#ffffff" text-anchor="middle">9</text>
</svg>
```

- [ ] **Step 2: Create the favicon/logo (reuse the same SVG, simplified)**

Create `public/calendar.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="64" height="64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <rect x="300" y="96" width="44" height="150" rx="22" fill="#1E3A8A"/>
  <rect x="680" y="96" width="44" height="150" rx="22" fill="#1E3A8A"/>
  <rect x="180" y="220" width="664" height="640" rx="72" fill="#ffffff"/>
  <rect x="180" y="220" width="664" height="150" rx="72" fill="#1E3A8A"/>
  <rect x="180" y="320" width="664" height="50" fill="#1E3A8A"/>
  <circle cx="560" cy="640" r="74" fill="#EF4444"/>
</svg>
```

- [ ] **Step 3: Create the rasterizer script**

Create `src-tauri/icons-src/rasterize.mjs`:
```js
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, "icon.svg"), "utf-8");
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
const png = resvg.render().asPng();
writeFileSync(join(here, "icon-source.png"), png);
console.log("wrote icon-source.png (1024x1024)");
```

- [ ] **Step 4: Rasterize the SVG to a 1024×1024 PNG**

Run:
```bash
node src-tauri/icons-src/rasterize.mjs
```
Expected: prints `wrote icon-source.png (1024x1024)` and creates `src-tauri/icons-src/icon-source.png`.

- [ ] **Step 5: Generate all platform icons**

Run:
```bash
npm run tauri icon src-tauri/icons-src/icon-source.png
```
Expected: regenerates `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, plus `icon.png`.

- [ ] **Step 6: Commit (optional)**

```bash
git add src-tauri/icons src-tauri/icons-src public/calendar.svg
git commit -m "feat(assets): redesign calendar app icon and favicon"
```

---

## Task 11: Manual verification & polish

**Files:** none (verification only; small CSS tweaks if needed).

- [ ] **Step 1: Run the full app**

Run: `npm run tauri dev`
Expected: a 360×460 window opens, **always on top**, with native macOS traffic lights (●●●) top-left and content clearing them. Title bar text hidden.

- [ ] **Step 2: Verify calendar behavior**

- Today is highlighted (blue).
- Each cell shows solar number + lunar/festival/jieqi label (e.g. a festival day shows the festival name in orange).
- ‹ › switches months; "回今天" returns to the current month and the highlight is intact.
- Clicking a day selects it (tinted background).

- [ ] **Step 3: Verify events**

- Add an event for the selected day (title + time + 提醒). It appears in the list; the day shows a red dot.
- Delete the event; dot disappears.
- Reload the window (close + reopen) — the event persists.

- [ ] **Step 4: Verify notifications**

- Add an event for **today** with 提醒 checked and a time 1–2 minutes in the future.
- Keep the app open and wait. At the configured minute, a macOS notification fires ("日历提醒 — <title> · <time>").
- On first run, macOS shows a permission prompt; granting enables notifications. Denying leaves the in-app dot only (graceful).

- [ ] **Step 5: Verify icon**

- The Dock / window icon shows the new calendar icon (after a full `npm run tauri build`, or in dev on macOS the cached icon may persist — a production build confirms the final icon).

- [ ] **Step 6: Run the test suite one final time**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Final commit (optional)**

```bash
git add -A
git commit -m "chore: calendar widget complete and verified"
```

---

## Self-Review Notes

- **Spec coverage:** window/overlay (Task 9), icon redesign (Task 10), component structure (Tasks 5–8), data model + persistence (Tasks 3, 7), lunar/festivals/jieqi (Task 2), notifications + app-open-only semantics incl. no-stale-catch-up (Tasks 4, 9), styling (Tasks 5–8), testing (Tasks 2–5, 11). All spec sections mapped.
- **Type/name consistency:** `getDayInfo` returns `{ label, kind, jieqi, festivals, lunarDay }` and is consumed identically in `CalendarWidget`. Event shape `{ id, title, time, notify }` consistent across `useEvents`, `useReminders`, `EventPanel`. Pure helpers named `withEventAdded` / `withEventRemoved` (distinct from composable methods `addEvent` / `removeEvent`).
- **Placeholders:** none — every code step contains full source.
```
