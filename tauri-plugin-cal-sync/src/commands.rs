use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::CalSyncExt;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.cal_sync().ping(payload)
}

#[command]
pub(crate) async fn schedule_notification<R: Runtime>(
    app: AppHandle<R>,
    payload: ScheduleNotificationRequest,
) -> Result<serde_json::Value> {
    app.cal_sync().schedule_notification(payload.id, payload.title, payload.body, payload.at_ms)
}

#[command]
pub(crate) async fn cancel_notifications<R: Runtime>(
    app: AppHandle<R>,
    payload: CancelNotificationsRequest,
) -> Result<serde_json::Value> {
    app.cal_sync().cancel_notifications(payload.ids)
}
