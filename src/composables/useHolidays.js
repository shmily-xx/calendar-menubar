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

// Classify a day for the selected-day status bar.
// weekday: 0=Sun..6=Sat (matches lunar-javascript / getDayInfo).
// Returns one of:
//   { kind: "holiday", name }  法定节假日(off-day)
//   { kind: "makeup",  name }  调班补班(weekend made working)
//   { kind: "weekend" }         普通周末
//   { kind: "workday" }         普通工作日
export function dayStatus(data, key, weekday) {
  const e = data.get(key);
  if (e) return e.off ? { kind: "holiday", name: e.name || "" } : { kind: "makeup", name: e.name || "" };
  return weekday === 0 || weekday === 6 ? { kind: "weekend" } : { kind: "workday" };
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
