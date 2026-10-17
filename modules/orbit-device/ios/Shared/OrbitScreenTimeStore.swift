import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

struct OrbitRule: Codable, Equatable {
  var id: String
  var appIds: [String]
  var kind: String
  var enabled: Bool
  var until: Double?
  var dailyMinutes: Double?
  var days: [Int]?
  var startMinute: Int?
  var endMinute: Int?
}

enum OrbitDeviceFailure: LocalizedError {
  case unavailable(String)
  var errorDescription: String? {
    switch self { case .unavailable(let message): return message }
  }
}

enum OrbitScreenTimeStore {
  static var group: String? { Bundle.main.object(forInfoDictionaryKey: "OrbitAppGroup") as? String }
  static var shared: UserDefaults? {
    guard let group, FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil else { return nil }
    return UserDefaults(suiteName: group)
  }
  static var rules: [OrbitRule] {
    guard let data = shared?.data(forKey: "rules") else { return [] }
    return (try? JSONDecoder().decode([OrbitRule].self, from: data)) ?? []
  }
  static var selection: FamilyActivitySelection {
    guard let data = shared?.data(forKey: "selection") else { return FamilyActivitySelection() }
    return (try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)) ?? FamilyActivitySelection()
  }

  static func saveSelection(_ selection: FamilyActivitySelection) throws {
    guard let shared else { throw OrbitDeviceFailure.unavailable("The signed App Group is unavailable. Check the app and extension provisioning profiles.") }
    shared.set(try PropertyListEncoder().encode(selection), forKey: "selection")
  }

  static func rule(for activity: DeviceActivityName) -> OrbitRule? {
    guard let id = (shared?.dictionary(forKey: "routes") as? [String: String])?[activity.rawValue] else { return nil }
    return rules.first { $0.id == id && $0.enabled }
  }

  static func settings(for rule: OrbitRule) -> ManagedSettingsStore {
    ManagedSettingsStore(named: ManagedSettingsStore.Name("orbit.\(rule.id)"))
  }

  static func shield(_ rule: OrbitRule) {
    let selected = selection
    let store = settings(for: rule)
    store.shield.applications = selected.applicationTokens.isEmpty ? nil : selected.applicationTokens
    store.shield.applicationCategories = selected.categoryTokens.isEmpty ? nil : .specific(selected.categoryTokens)
    store.shield.webDomains = selected.webDomainTokens.isEmpty ? nil : selected.webDomainTokens
  }

  static func isScheduledNow(_ rule: OrbitRule, now: Date = Date()) -> Bool {
    let calendar = Calendar.current
    let components = calendar.dateComponents([.weekday, .hour, .minute], from: now)
    guard let weekday = components.weekday, let hour = components.hour, let minute = components.minute,
          let start = rule.startMinute, let end = rule.endMinute, let days = rule.days else { return false }
    let day = weekday - 1
    let time = hour * 60 + minute
    if start < end { return days.contains(day) && time >= start && time < end }
    return (days.contains(day) && time >= start) || (days.contains((day + 6) % 7) && time < end)
  }

  private struct Registration {
    let name: DeviceActivityName
    let ruleID: String
    let schedule: DeviceActivitySchedule
    let events: [DeviceActivityEvent.Name: DeviceActivityEvent]
  }

  private static func registrations(_ rules: [OrbitRule]) throws -> [Registration] {
    let selected = selection
    if rules.contains(where: { $0.enabled }) && selected.applicationTokens.isEmpty && selected.categoryTokens.isEmpty && selected.webDomainTokens.isEmpty {
      throw OrbitDeviceFailure.unavailable("Choose apps in Apple's Screen Time picker before applying a restriction.")
    }
    var result: [Registration] = []
    for rule in rules where rule.enabled {
      guard rule.appIds == ["ios-selection"] else {
        throw OrbitDeviceFailure.unavailable("iOS restrictions apply to the private selection from Apple's picker. Use Selected iOS apps; Android app IDs cannot identify Apple application tokens.")
      }
      switch rule.kind {
      case "until":
        guard let timestamp = rule.until else { throw OrbitDeviceFailure.unavailable("The restriction needs an end time.") }
        let end = Date(timeIntervalSince1970: timestamp / 1000)
        if end <= Date() { continue }
        guard end.timeIntervalSinceNow >= 15 * 60 else {
          throw OrbitDeviceFailure.unavailable("Apple Device Activity requires restriction intervals of at least 15 minutes.")
        }
        let calendar = Calendar.current
        let components: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let schedule = DeviceActivitySchedule(intervalStart: calendar.dateComponents(components, from: Date()), intervalEnd: calendar.dateComponents(components, from: end), repeats: false)
        result.append(Registration(name: DeviceActivityName("orbit.\(rule.id).until"), ruleID: rule.id, schedule: schedule, events: [:]))
      case "schedule":
        guard let start = rule.startMinute, let end = rule.endMinute, let days = rule.days,
              (0...1439).contains(start), (0...1439).contains(end), !days.isEmpty,
              days.allSatisfy({ (0...6).contains($0) }), (end - start + 1440) % 1440 >= 15 else {
          throw OrbitDeviceFailure.unavailable("Choose valid schedule days and a time window of at least 15 minutes.")
        }
        for day in Set(days).sorted() {
          let endDay = start > end ? (day + 1) % 7 : day
          let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: start / 60, minute: start % 60, weekday: day + 1),
            intervalEnd: DateComponents(hour: end / 60, minute: end % 60, weekday: endDay + 1), repeats: true)
          result.append(Registration(name: DeviceActivityName("orbit.\(rule.id).day\(day)"), ruleID: rule.id, schedule: schedule, events: [:]))
        }
      case "daily":
        guard let minutes = rule.dailyMinutes, minutes >= 1, minutes <= 1440 else {
          throw OrbitDeviceFailure.unavailable("Choose a daily allowance from 1 to 1440 minutes.")
        }
        guard #available(iOS 17.4, *) else {
          throw OrbitDeviceFailure.unavailable("Daily allowances require iOS 17.4 or later so today's earlier activity can be included. Scheduled and temporary shields remain available.")
        }
        let schedule = DeviceActivitySchedule(intervalStart: DateComponents(hour: 0, minute: 0), intervalEnd: DateComponents(hour: 23, minute: 59, second: 59), repeats: true)
        let event = DeviceActivityEvent(applications: selected.applicationTokens, categories: selected.categoryTokens,
          webDomains: selected.webDomainTokens, threshold: DateComponents(second: Int(minutes * 60)), includesPastActivity: true)
        result.append(Registration(name: DeviceActivityName("orbit.\(rule.id).daily"), ruleID: rule.id, schedule: schedule, events: [DeviceActivityEvent.Name("allowance"): event]))
      default: throw OrbitDeviceFailure.unavailable("Unknown restriction type.")
      }
    }
    guard result.count <= 20 else { throw OrbitDeviceFailure.unavailable("These rules exceed Apple's 20-monitor limit. Use fewer schedule days or restrictions.") }
    return result
  }

  static func apply(_ nextRules: [OrbitRule], force: Bool = false) throws {
    guard let shared else { throw OrbitDeviceFailure.unavailable("Configure and sign the shared App Group before applying restrictions.") }
    guard AuthorizationCenter.shared.authorizationStatus == .approved else {
      throw OrbitDeviceFailure.unavailable("Screen Time authorization is required to apply shields.")
    }
    let previous = rules
    if previous == nextRules && !force { return }
    let next = try registrations(nextRules) // Validate everything before changing OS state.
    let center = DeviceActivityCenter()
    let current = center.activities.filter { $0.rawValue.hasPrefix("orbit.") }
    center.stopMonitoring(current)
    previous.forEach { settings(for: $0).clearAllSettings() }
    shared.set(try JSONEncoder().encode(nextRules), forKey: "rules")
    shared.set(Dictionary(uniqueKeysWithValues: next.map { ($0.name.rawValue, $0.ruleID) }), forKey: "routes")
    do {
      for registration in next {
        try center.startMonitoring(registration.name, during: registration.schedule, events: registration.events)
      }
      for rule in nextRules where rule.enabled {
        if (rule.kind == "until" && (rule.until ?? 0) > Date().timeIntervalSince1970 * 1000) || (rule.kind == "schedule" && isScheduledNow(rule)) {
          shield(rule)
        }
      }
    } catch {
      center.stopMonitoring(next.map(\.name))
      nextRules.forEach { settings(for: $0).clearAllSettings() }
      shared.set(try JSONEncoder().encode(previous), forKey: "rules")
      // Do not leave a partially applied restriction reported as success. Try to
      // restore the previous supported schedules; communicate failures to JS.
      let old = (try? registrations(previous)) ?? []
      shared.set(Dictionary(uniqueKeysWithValues: old.map { ($0.name.rawValue, $0.ruleID) }), forKey: "routes")
      for registration in old { try? center.startMonitoring(registration.name, during: registration.schedule, events: registration.events) }
      for rule in previous where rule.enabled {
        if (rule.kind == "until" && (rule.until ?? 0) > Date().timeIntervalSince1970 * 1000) || (rule.kind == "schedule" && isScheduledNow(rule)) { shield(rule) }
      }
      throw error
    }
  }
}
