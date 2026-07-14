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
