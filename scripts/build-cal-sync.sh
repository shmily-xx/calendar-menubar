#!/usr/bin/env bash
# 编译 Swift helper(调 EventKit 读系统日历事件)到 src-tauri/bin/cal-sync
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src-tauri/bin
xcrun swiftc -O \
  src-tauri/swift/main.swift \
  src-tauri/swift/Mapping.swift \
  -o src-tauri/bin/cal-sync \
  -framework EventKit -framework Foundation
chmod +x src-tauri/bin/cal-sync
echo "[build-cal-sync] -> src-tauri/bin/cal-sync"
