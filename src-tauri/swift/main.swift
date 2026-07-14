import Foundation
import EventKit

// 解析 --start/--end(epoch 秒)
func parseArgs() -> (Date, Date)? {
    let args = CommandLine.arguments
    var start: Date?
    var end: Date?
    var i = 1
    while i < args.count {
        if args[i] == "--start", i + 1 < args.count, let s = Double(args[i + 1]) {
            start = Date(timeIntervalSince1970: s); i += 2; continue
        }
        if args[i] == "--end", i + 1 < args.count, let e = Double(args[i + 1]) {
            end = Date(timeIntervalSince1970: e); i += 2; continue
        }
        i += 1
    }
    guard let s = start, let e = end else { return nil }
    return (s, e)
}

guard let (startDate, endDate) = parseArgs() else {
    emit(SystemPayload(calendarStatus: "error", events: nil, remindersStatus: "error", reminders: nil))
    exit(2)
}

let store = EKEventStore()

// 用一个 helper 同步等待权限结果
func requestAccess(_ block: (@escaping (Bool) -> Void) -> Void) -> Bool {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    block { ok in
        granted = ok
        semaphore.signal()
    }
    semaphore.wait()
    return granted
}

// —— 日历事件 ——
var calendarStatus = "denied"
var events: [EKEvent] = []
let calGranted: Bool = {
    if #available(macOS 14.0, *) {
        return requestAccess { done in
            store.requestFullAccessToEvents { ok, _ in done(ok) }
        }
    } else {
        return requestAccess { done in
            store.requestAccess(to: .event) { ok, _ in done(ok) }
        }
    }
}()
if calGranted {
    calendarStatus = "ok"
    let pred = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
    events = store.events(matching: pred)
}

// —— 提醒事项(独立的权限) ——
var remindersStatus = "denied"
var reminders: [EKReminder] = []
let remGranted: Bool = {
    if #available(macOS 14.0, *) {
        return requestAccess { done in
            store.requestFullAccessToReminders { ok, _ in done(ok) }
        }
    } else {
        return requestAccess { done in
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

emit(SystemPayload(
    calendarStatus: calendarStatus,
    events: mapEvents(events),
    remindersStatus: remindersStatus,
    reminders: mapReminders(reminders)
))
