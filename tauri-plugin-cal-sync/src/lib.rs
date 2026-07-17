use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::CalSync;
#[cfg(mobile)]
use mobile::CalSync;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the cal-sync APIs.
pub trait CalSyncExt<R: Runtime> {
  fn cal_sync(&self) -> &CalSync<R>;
}

impl<R: Runtime, T: Manager<R>> crate::CalSyncExt<R> for T {
  fn cal_sync(&self) -> &CalSync<R> {
    self.state::<CalSync<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("cal-sync")
    .invoke_handler(tauri::generate_handler![commands::ping, commands::schedule_notification, commands::cancel_notifications])
    .setup(|app, api| {
      #[cfg(mobile)]
      let cal_sync = mobile::init(app, api)?;
      #[cfg(desktop)]
      let cal_sync = desktop::init(app, api)?;
      app.manage(cal_sync);
      Ok(())
    })
    .build()
}
