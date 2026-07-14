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
