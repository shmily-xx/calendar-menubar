use tauri::{Emitter, Manager, RunEvent};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct CalEvent {
    pub id: String,
    pub title: String,
    #[serde(rename = "startISO")]
    pub start_iso: String,
    #[serde(rename = "endISO")]
    pub end_iso: String,
    #[serde(rename = "allDay")]
    pub all_day: bool,
    #[serde(rename = "calendarTitle")]
    pub calendar_title: String,
    #[serde(rename = "calendarColor")]
    pub calendar_color: String,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct CalReminder {
    pub id: String,
    pub title: String,
    #[serde(rename = "dueISO")]
    pub due_iso: String,
    #[serde(rename = "allDay")]
    pub all_day: bool,
    #[serde(rename = "calendarTitle")]
    pub calendar_title: String,
    #[serde(rename = "calendarColor")]
    pub calendar_color: String,
    pub priority: i64,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct SystemEventsPayload {
    #[serde(rename = "calendarStatus")]
    pub calendar_status: String,
    #[serde(default)]
    pub events: Option<Vec<CalEvent>>,
    #[serde(rename = "remindersStatus")]
    pub reminders_status: String,
    #[serde(default)]
    pub reminders: Option<Vec<CalReminder>>,
}

// 纯函数:把 helper stdout 解析为 payload。单独可测。
// Swift JSONEncoder 对 nil 可选会省略键,故 events/reminders 用 #[serde(default)] 兼容缺失键。
pub fn parse_payload(json: &str) -> Result<SystemEventsPayload, serde_json::Error> {
    serde_json::from_str(json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ok_with_events_and_reminders() {
        let json = r##"{"calendarStatus":"ok","events":[{"id":"x","title":"Lunch","startISO":"2026-07-13T05:00:00Z","endISO":"2026-07-13T06:00:00Z","allDay":false,"calendarTitle":"Work","calendarColor":"#FF0000","location":null}],"remindersStatus":"ok","reminders":[{"id":"r1","title":"Pay rent","dueISO":"2026-07-13T08:00:00Z","allDay":false,"calendarTitle":"Rems","calendarColor":"#00FF00","priority":1}]}"##;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.calendar_status, "ok");
        assert_eq!(p.reminders_status, "ok");
        let ev = p.events.unwrap().pop().unwrap();
        assert_eq!(ev.title, "Lunch");
        let rm = p.reminders.unwrap().pop().unwrap();
        assert_eq!(rm.title, "Pay rent");
        assert_eq!(rm.priority, 1);
    }

    #[test]
    fn parse_calendar_ok_reminders_denied_missing_keys() {
        // 提醒被拒:reminders 键被 Swift 省略
        let json = r##"{"calendarStatus":"ok","events":[],"remindersStatus":"denied"}"##;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.calendar_status, "ok");
        assert_eq!(p.reminders_status, "denied");
        assert!(p.reminders.is_none());
    }

    #[test]
    fn parse_both_denied() {
        let p = parse_payload(r##"{"calendarStatus":"denied","remindersStatus":"denied"}"##).unwrap();
        assert_eq!(p.calendar_status, "denied");
        assert_eq!(p.reminders_status, "denied");
        assert!(p.events.is_none());
        assert!(p.reminders.is_none());
    }
}

#[tauri::command]
fn quit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

// 切换 macOS Dock 图标显示。Regular = 显示，Accessory = 隐藏（变为纯菜单栏应用）。
// 运行时即时生效，无需重启。其它平台为空操作。
#[tauri::command]
fn set_dock_visible(app_handle: tauri::AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        let _ = app_handle.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, visible);
    }
}

// macOS:spawn cal-sync helper 读系统日历事件(只读)。其它平台返回 unsupported。
#[tauri::command]
fn fetch_system_events(
    app_handle: tauri::AppHandle,
    start: f64,
    end: f64,
) -> Result<SystemEventsPayload, String> {
    #[cfg(target_os = "macos")]
    {
        // 优先用 bundle 资源(prod);resources 保留目录结构,落在 Resources/bin/cal-sync。
        // 回退到源码侧 dev 产物(dev 下未打包)。
        let helper = app_handle
            .path()
            .resource_dir()
            .ok()
            .map(|d| d.join("bin").join("cal-sync"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| {
                std::path::PathBuf::from(format!(
                    "{}/bin/cal-sync",
                    env!("CARGO_MANIFEST_DIR")
                ))
            });

        let output = std::process::Command::new(&helper)
            .args(["--start", &start.to_string(), "--end", &end.to_string()])
            .output()
            .map_err(|e| format!("spawn helper: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_payload(stdout.trim()).map_err(|e| format!("parse helper json: {e}"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, start, end);
        Ok(SystemEventsPayload {
            status: "unsupported".into(),
            events: None,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![quit_app, set_dock_visible, fetch_system_events])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 点击 Dock 图标重新打开应用时，通知前端显示弹窗
    app.run(|app_handle, event| {
        if let RunEvent::Resumed = event {
            let _ = app_handle.emit("dock-clicked", ());
        }
    });
}
