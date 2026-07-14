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

export function withEventUpdated(data, id, patch) {
  const next = {};
  for (const k of Object.keys(data)) {
    next[k] = data[k].map((e) => (e.id === id ? { ...e, ...patch } : e));
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
  function updateEvent(id, patch) {
    eventsByDate.value = withEventUpdated(eventsByDate.value, id, patch);
  }
  return { eventsByDate, addEvent, removeEvent, updateEvent };
}
