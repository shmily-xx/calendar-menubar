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
