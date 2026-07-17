use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<CalSync<R>> {
  Ok(CalSync(app.clone()))
}

/// Access to the cal-sync APIs.
pub struct CalSync<R: Runtime>(AppHandle<R>);

impl<R: Runtime> CalSync<R> {
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    Ok(PingResponse {
      value: payload.value,
    })
  }

  /// 桌面无 iOS 通知调度,返回 unsupported(本分支专注 iOS;桌面通知走 main 分支)。
  pub fn schedule_notification(&self, _id: i64, _title: String, _body: String, _at_ms: f64) -> crate::Result<serde_json::Value> {
    Ok(serde_json::json!({ "ok": false, "reason": "unsupported on desktop" }))
  }
  pub fn cancel_notifications(&self, _ids: Vec<i64>) -> crate::Result<serde_json::Value> {
    Ok(serde_json::json!({ "ok": true }))
  }
}
