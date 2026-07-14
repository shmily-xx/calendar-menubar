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

// reminders: [{ id, title, dueISO, allDay, calendarTitle, calendarColor, priority }]
// 返回 { [YYYY-MM-DD]: reminder[] }。提醒按到期日(dueISO 的本地日)入桶。
export function bucketReminders(reminders) {
  const buckets = {};
  for (const r of reminders) {
    const key = localDateKey(new Date(r.dueISO));
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(r);
  }
  return buckets;
}
