use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_cal_sync);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<CalSync<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("", "ExamplePlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_cal_sync)?;
  Ok(CalSync(handle))
}

/// Access to the cal-sync APIs.
pub struct CalSync<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> CalSync<R> {
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    self
      .0
      .run_mobile_plugin("ping", payload)
      .map_err(Into::into)
  }

  /// iOS:调用 Swift EventKit 读系统日历事件 + 提醒事项。返回与主 app SystemEventsPayload 同构的 JSON。
  pub fn fetch_system_events(&self, start: f64, end: f64) -> crate::Result<serde_json::Value> {
    self
      .0
      .run_mobile_plugin("fetchSystemEvents", FetchEventsRequest { start, end })
      .map_err(Into::into)
  }

  /// iOS:用 UNUserNotificationCenter 调度本地通知(绕过 tauri-plugin-notification 的 iOS schedule bug)。
  pub fn schedule_notification(&self, id: i64, title: String, body: String, at_ms: f64) -> crate::Result<serde_json::Value> {
    self
      .0
      .run_mobile_plugin("scheduleNotification", ScheduleNotificationRequest { id, title, body, at_ms })
      .map_err(Into::into)
  }

  /// iOS:按 id 取消待发通知。
  pub fn cancel_notifications(&self, ids: Vec<i64>) -> crate::Result<serde_json::Value> {
    self
      .0
      .run_mobile_plugin("cancelNotifications", CancelNotificationsRequest { ids })
      .map_err(Into::into)
  }
}
