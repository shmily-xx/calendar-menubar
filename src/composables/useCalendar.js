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
  const lunarMonth = lunar.getMonthInChinese();
  const weekday = solar.getWeek(); // 0=Sunday..6=Saturday
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
  return { label, kind, jieqi, festivals, lunarDay, lunarMonth, weekday };
}

export function useCalendar(getWeekStart = () => 1, { getToday = todayParts } = {}) {
  const today = ref(getToday());
  const year = ref(today.value.year);
  const month = ref(today.value.month);
  const todayKey = computed(() => toKey(today.value.year, today.value.month, today.value.day));
  const matrix = computed(() => buildMonthMatrix(year.value, month.value, getWeekStart()));

  // Re-read "today" from the injected clock; mutate the reactive ref only when
  // the calendar day actually changed, so todayKey/goToday roll over at midnight
  // instead of being frozen at launch. Returns whether the day changed.
  function refreshToday() {
    const t = getToday();
    if (toKey(t.year, t.month, t.day) === todayKey.value) return false;
    today.value = t;
    return true;
  }
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
    year.value = today.value.year;
    month.value = today.value.month;
  }
  return { year, month, todayKey, matrix, prev, next, goToday, getDayInfo, refreshToday };
}
