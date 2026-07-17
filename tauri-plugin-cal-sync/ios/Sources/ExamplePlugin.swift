import SwiftRs
import Tauri
import UIKit
import WebKit
import Foundation
import EventKit
import UserNotifications

// —— Codable 数据结构(与 cal-sync helper / 前端约定同构) ——
struct CalEvent: Codable {
  let id: String
  let title: String
  let startISO: String
  let endISO: String
  let allDay: Bool
  let calendarTitle: String
  let calendarColor: String
  let location: String?
}

struct CalReminder: Codable {
  let id: String
  let title: String
  let dueISO: String
  let allDay: Bool
  let calendarTitle: String
  let calendarColor: String
  let priority: Int
}

struct SystemPayload: Codable {
  let calendarStatus: String
  let events: [CalEvent]?
  let remindersStatus: String
  let reminders: [CalReminder]?
}

class FetchArgs: Decodable {
  let start: Double
  let end: Double
}

// 通知入参
class ScheduleArgs: Decodable {
  let id: Int64
  let title: String
  let body: String
  let atMs: Double
}
class CancelArgs: Decodable {
  let ids: [Int64]
}

let isoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = .withInternetDateTime
  return f
}()

func colorToHex(_ color: CGColor?) -> String {
  guard let color = color, let comps = color.components, comps.count >= 3 else {
    return "#888888"
  }
  let r = Int((comps[0] * 255).rounded())
  let g = Int((comps[1] * 255).rounded())
  let b = Int((comps[2] * 255).rounded())
  return String(format: "#%02X%02X%02X", r, g, b)
}

func mapEvents(_ events: [EKEvent]) -> [CalEvent] {
  return events.map { ev in
    CalEvent(
      id: ev.eventIdentifier ?? UUID().uuidString,
      title: ev.title ?? "",
      startISO: isoFormatter.string(from: ev.startDate),
      endISO: isoFormatter.string(from: ev.endDate),
      allDay: ev.isAllDay,
      calendarTitle: ev.calendar?.title ?? "",
      calendarColor: colorToHex(ev.calendar?.cgColor),
      location: ev.location
    )
  }
}

func mapReminders(_ reminders: [EKReminder]) -> [CalReminder] {
  var out: [CalReminder] = []
  for r in reminders {
    guard let dc = r.dueDateComponents,
          let due = Calendar.current.date(from: dc) else { continue }
    let allDay = (dc.hour == nil || dc.minute == nil)
    out.append(CalReminder(
      id: r.calendarItemIdentifier,
      title: r.title ?? "",
      dueISO: isoFormatter.string(from: due),
      allDay: allDay,
      calendarTitle: r.calendar?.title ?? "",
      calendarColor: colorToHex(r.calendar?.cgColor),
      priority: r.priority
    ))
  }
  return out
}

// 同步等待异步权限结果
func requestAccessSync(_ block: (@escaping (Bool) -> Void) -> Void) -> Bool {
  let semaphore = DispatchSemaphore(value: 0)
  var granted = false
  block { ok in
    granted = ok
    semaphore.signal()
  }
  semaphore.wait()
  return granted
}

class CalSyncPlugin: Plugin, UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .list])
  }

  @objc public func fetchSystemEvents(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(FetchArgs.self)
    let startDate = Date(timeIntervalSince1970: args.start)
    let endDate = Date(timeIntervalSince1970: args.end)
    let store = EKEventStore()

    var calendarStatus = "denied"
    var events: [EKEvent] = []
    let calGranted: Bool = {
      if #available(iOS 17.0, *) {
        return requestAccessSync { done in
          store.requestFullAccessToEvents { ok, _ in done(ok) }
        }
      } else {
        return requestAccessSync { done in
          store.requestAccess(to: .event) { ok, _ in done(ok) }
        }
      }
    }()
    if calGranted {
      calendarStatus = "ok"
      let pred = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
      events = store.events(matching: pred)
    }

    var remindersStatus = "denied"
    var reminders: [EKReminder] = []
    let remGranted: Bool = {
      if #available(iOS 17.0, *) {
        return requestAccessSync { done in
          store.requestFullAccessToReminders { ok, _ in done(ok) }
        }
      } else {
        return requestAccessSync { done in
          store.requestAccess(to: .reminder) { ok, _ in done(ok) }
        }
      }
    }()
    if remGranted {
      remindersStatus = "ok"
      let pred = store.predicateForIncompleteReminders(withDueDateStarting: startDate, ending: endDate, calendars: nil)
      let semaphore = DispatchSemaphore(value: 0)
      var fetched: [EKReminder] = []
      store.fetchReminders(matching: pred) { rems in
        fetched = rems ?? []
        semaphore.signal()
      }
      semaphore.wait()
      reminders = fetched
    }

    let payload = SystemPayload(
      calendarStatus: calendarStatus,
      events: mapEvents(events),
      remindersStatus: remindersStatus,
      reminders: mapReminders(reminders)
    )
    invoke.resolve(payload)
  }

  // 调度本地通知(绕过 tauri-plugin-notification iOS schedule bug)
  @objc public func scheduleNotification(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ScheduleArgs.self)
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      guard granted else { invoke.resolve(["ok": false, "reason": "denied"]); return }
      let content = UNMutableNotificationContent()
      content.title = args.title
      content.body = args.body
      content.sound = .default
      let interval = max(args.atMs / 1000.0 - Date().timeIntervalSince1970, 1)
      let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
      let request = UNNotificationRequest(identifier: String(args.id), content: content, trigger: trigger)
      center.add(request) { error in
        if let error = error {
          invoke.resolve(["ok": false, "reason": "\(error.localizedDescription)"])
        } else {
          invoke.resolve(["ok": true])
        }
      }
    }
  }

  @objc public func cancelNotifications(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(CancelArgs.self)
    let ids = args.ids.map(String.init)
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    invoke.resolve(["ok": true])
  }
}

@_cdecl("init_plugin_cal_sync")
func initPlugin() -> Plugin {
  let plugin = CalSyncPlugin()
  // 设通知 delegate:前台时也展示横幅(弥补 tauri-plugin-notification 未配 willPresent)
  UNUserNotificationCenter.current().delegate = plugin
  return plugin
}
