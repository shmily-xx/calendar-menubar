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
  it("holiday shows 休 tag; event dot coexists independently (left corner)", () => {
    const w = mount(DayCell, { props: { ...baseProps, status: "holiday", hasEvent: true } });
    expect(w.classes()).toContain("st-holiday");
    expect(w.find(".tag.rest").exists()).toBe(true);
    expect(w.find(".dot").exists()).toBe(true); // 红点独立显示,不再被角标顶替
  });
  it("no dot when the day has no event", () => {
    const w = mount(DayCell, { props: { ...baseProps, status: "holiday", hasEvent: false } });
    expect(w.find(".dot").exists()).toBe(false);
  });
  it("shows 班 tag + st-makeup class on a makeup workday", () => {
    const w = mount(DayCell, { props: { ...baseProps, status: "makeup" } });
    expect(w.classes()).toContain("st-makeup");
    expect(w.find(".tag.work").exists()).toBe(true);
  });
  it("default workday: no status tag, dot only with events", () => {
    const w = mount(DayCell, { props: { ...baseProps, status: "workday", hasEvent: true } });
    expect(w.find(".tag").exists()).toBe(false);
    expect(w.find(".dot").exists()).toBe(true);
  });
  it("emits select with the day key on click", async () => {
    const w = mount(DayCell, { props: baseProps });
    await w.trigger("click");
    expect(w.emitted("select")[0]).toEqual(["2026-07-09"]);
  });
});
