import { describe, it, expect } from "vitest";
import { buildTrayText } from "../utils/trayIcon";

const info = {
  solarMonth: 7,
  solarDay: 11,
  lunarMonth: "六",
  lunarDay: "廿六",
  weekday: 5, // Friday (0=Sunday)
  nextHoliday: { name: "中秋", daysUntil: 11 },
};
const infoNoHoliday = { ...info, nextHoliday: null };

describe("buildTrayText", () => {
  it("iconOnly returns empty", () => {
    expect(buildTrayText({ iconOnly: true }, info)).toBe("");
  });

  it("day num only -> day number", () => {
    expect(buildTrayText({ iconOnly: false, month: "off", day: "num", week: "off", countdown: false }, info)).toBe("11");
  });

  it("solar month + day -> M月D", () => {
    expect(buildTrayText({ iconOnly: false, month: "num", day: "num", week: "off", countdown: false }, info)).toBe("7月11");
  });

  it("num2 month -> zero-padded with 月", () => {
    expect(buildTrayText({ iconOnly: false, month: "num2", day: "num", week: "off", countdown: false }, info)).toBe("07月11");
  });

  it("solar month only -> with 月", () => {
    expect(buildTrayText({ iconOnly: false, month: "num", day: "off", week: "off", countdown: false }, info)).toBe("7月");
  });

  it("lunar month + day -> 六月廿六", () => {
    expect(buildTrayText({ iconOnly: false, month: "lunar", day: "lunar", week: "off", countdown: false }, info)).toBe("六月廿六");
  });

  it("lunar day only -> 廿六", () => {
    expect(buildTrayText({ iconOnly: false, month: "off", day: "lunar", week: "off", countdown: false }, info)).toBe("廿六");
  });

  it("day + week short -> 11 五", () => {
    expect(buildTrayText({ iconOnly: false, month: "off", day: "num", week: "short", countdown: false }, info)).toBe("11 五");
  });

  it("day + week mid -> 11 周五", () => {
    expect(buildTrayText({ iconOnly: false, month: "off", day: "num", week: "mid", countdown: false }, info)).toBe("11 周五");
  });

  it("countdown -> 距中秋11天", () => {
    expect(buildTrayText({ iconOnly: false, month: "off", day: "off", week: "off", countdown: true }, info)).toBe("距中秋11天");
  });

  it("countdown with no upcoming holiday -> empty", () => {
    expect(buildTrayText({ iconOnly: false, month: "off", day: "off", week: "off", countdown: true }, infoNoHoliday)).toBe("");
  });

  it("full combo -> 7月11 周五 距中秋11天", () => {
    expect(buildTrayText({ iconOnly: false, month: "num", day: "num", week: "mid", countdown: true }, info)).toBe("7月11 周五 距中秋11天");
  });
});
