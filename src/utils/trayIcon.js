import { Image } from "@tauri-apps/api/image";

function pad(n) {
  return String(n).padStart(2, "0");
}

const WEEK_CHARS = ["日", "一", "二", "三", "四", "五", "六"];

function monthToken(month, info) {
  if (month === "num") return info.solarMonth + "月";
  if (month === "num2") return pad(info.solarMonth) + "月";
  if (month === "lunar") return info.lunarMonth + "月"; // e.g. 五月
  return "";
}
function dayToken(day, info) {
  if (day === "num") return String(info.solarDay);
  if (day === "lunar") return info.lunarDay; // e.g. 廿六
  return "";
}
function weekToken(week, weekday) {
  const c = WEEK_CHARS[weekday] ?? "";
  if (week === "short") return c;
  if (week === "mid") return "周" + c;
  if (week === "long") return "星期" + c;
  return "";
}

// Build the menu-bar text from the composable tray config + date info. Pure/tested.
// tray: { iconOnly, month: "off"|"num"|"num2"|"lunar", day: "off"|"num"|"lunar",
//         week: "off"|"short"|"mid"|"long", countdown: bool }
// info: { solarMonth, solarDay, lunarMonth, lunarDay, weekday(0-6), nextHoliday: {name, daysUntil}|null }
export function buildTrayText(tray, info) {
  if (!tray || tray.iconOnly) return "";
  const monthOn = tray.month && tray.month !== "off";
  const dayOn = tray.day && tray.day !== "off";
  const monthSolar = tray.month === "num" || tray.month === "num2";
  const daySolar = tray.day === "num";

  const parts = [];
  if (monthOn && dayOn && monthSolar && daySolar) {
    const m = tray.month === "num2" ? pad(info.solarMonth) : String(info.solarMonth);
    parts.push(`${m}月${info.solarDay}`);
  } else if (monthOn && dayOn && tray.month === "lunar" && tray.day === "lunar") {
    parts.push(`${info.lunarMonth}月${info.lunarDay}`);
  } else {
    if (monthOn) parts.push(monthToken(tray.month, info));
    if (dayOn) parts.push(dayToken(tray.day, info));
  }
  if (tray.week && tray.week !== "off") parts.push(weekToken(tray.week, info.weekday));
  if (tray.countdown && info.nextHoliday) {
    parts.push(`距${info.nextHoliday.name}${info.nextHoliday.daysUntil}天`);
  }
  return parts.join(" ").trim();
}

// Draws the calendar glyph path into a 2D context.
function drawGlyphPath(ctx, w, h) {
  const padX = w * 0.18;
  const bodyX = padX;
  const bodyY = padX + h * 0.08;
  const bodyW = w - padX * 2;
  const bodyH = h - padX * 2 - h * 0.08;
  ctx.lineWidth = Math.max(2, w * 0.06);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH * 0.26);
  const ringR = w * 0.045;
  ctx.beginPath();
  ctx.arc(bodyX + bodyW * 0.28, bodyY - h * 0.02, ringR, 0, Math.PI * 2);
  ctx.arc(bodyX + bodyW * 0.72, bodyY - h * 0.02, ringR, 0, Math.PI * 2);
  ctx.fill();
}

// Render the tray icon to a Tauri Image. Adaptive width for text. Runtime-only (DOM canvas).
export async function renderTrayIcon(tray, info) {
  const size = tray && tray.size;
  const H = size === "compact" ? 38 : size === "large" ? 52 : 44;
  const canvas = document.createElement("canvas");
  canvas.height = H;

  if (tray && tray.iconOnly) {
    canvas.width = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, H, H);
    drawGlyphPath(ctx, H, H);
    const { data } = ctx.getImageData(0, 0, H, H);
    return Image.new(new Uint8Array(data), H, H);
  }

  const text = buildTrayText(tray, info) || "";
  const chars = Array.from(text);
  const fontSize =
    chars.length <= 2 ? Math.round(H * 0.75)
    : chars.length <= 4 ? Math.round(H * 0.65)
    : Math.round(H * 0.52);
  const isCjk = /[一-鿿]/.test(text);
  const font = isCjk
    ? `${fontSize}px -apple-system,"PingFang SC",sans-serif`
    : `bold ${fontSize}px -apple-system,Helvetica,sans-serif`;

  // measure on a temp context, then size the canvas (resize clears context)
  canvas.width = H;
  const tmp = canvas.getContext("2d");
  tmp.font = font;
  const measured = Math.ceil(tmp.measureText(text).width);
  const W = Math.max(H, measured + 12);
  canvas.width = W;

  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2 + (isCjk ? 0 : H * 0.02));

  const { data } = ctx.getImageData(0, 0, W, H);
  return Image.new(new Uint8Array(data), W, H);
}
