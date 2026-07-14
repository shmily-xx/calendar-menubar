import Foundation
import EventKit

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

// 两个数据源各自独立的权限状态。某源授权则带对应数组;未授权则该字段省略。
struct SystemPayload: Codable {
    let calendarStatus: String   // "ok" | "denied"
    let events: [CalEvent]?
    let remindersStatus: String  // "ok" | "denied"
    let reminders: [CalReminder]?
}

let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = .withInternetDateTime // -> 2026-07-13T05:00:00Z
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

// 纯映射:事件 -> JSON
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

// 纯映射:提醒事项 -> JSON。仅有 dueDate 的提醒才会被采集(无到期日的提醒不上日历)。
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

func emit(_ payload: SystemPayload) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(payload),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}
