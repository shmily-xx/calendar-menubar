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

// iOS:走 cal-sync 移动插件(Swift EventKit)读系统日历事件 + 提醒。其它平台 unsupported。
#[tauri::command]
fn fetch_system_events(
    app_handle: tauri::AppHandle,
    start: f64,
    end: f64,
) -> Result<SystemEventsPayload, String> {
    #[cfg(target_os = "ios")]
    {
        use tauri_plugin_cal_sync::CalSyncExt;
        let value: serde_json::Value = app_handle
            .cal_sync()
            .fetch_system_events(start, end)
            .map_err(|e| format!("{e}"))?;
        serde_json::from_value::<SystemEventsPayload>(value)
            .map_err(|e| format!("parse plugin response: {e}"))
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app_handle, start, end);
        Ok(SystemEventsPayload {
            calendar_status: "unsupported".into(),
            reminders_status: "unsupported".into(),
            events: None,
            reminders: None,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cal_sync::init())
        .invoke_handler(tauri::generate_handler![quit_app, fetch_system_events])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {});
}
