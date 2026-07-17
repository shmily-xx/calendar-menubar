// 运行时平台判断(不依赖 @tauri-apps/plugin-os,免去额外依赖)。
// iOS WKWebView 的 UA 含 iPhone/iPod;iPadOS 13+ 默认请求桌面站点,UA 为 Macintosh,
// 用 platform === 'MacIntel' && maxTouchPoints > 1 兜底识别 iPad。
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
