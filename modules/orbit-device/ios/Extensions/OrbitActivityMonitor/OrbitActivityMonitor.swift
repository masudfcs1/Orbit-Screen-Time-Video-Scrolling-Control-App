import DeviceActivity
import Foundation
import ManagedSettings

final class OrbitActivityMonitor: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    guard let rule = OrbitScreenTimeStore.rule(for: activity) else { return }
    if rule.kind == "daily" {
      OrbitScreenTimeStore.settings(for: rule).clearAllSettings()
    } else if rule.kind == "until" {
      if (rule.until ?? 0) > Date().timeIntervalSince1970 * 1000 { OrbitScreenTimeStore.shield(rule) }
    } else if OrbitScreenTimeStore.isScheduledNow(rule) {
      OrbitScreenTimeStore.shield(rule)
    }
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    guard let rule = OrbitScreenTimeStore.rule(for: activity) else { return }
    // Each rule has an independent settings store. One completed interval never
    // clears a different, overlapping restriction.
    OrbitScreenTimeStore.settings(for: rule).clearAllSettings()
  }

  override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
    super.eventDidReachThreshold(event, activity: activity)
    guard event.rawValue == "allowance", let rule = OrbitScreenTimeStore.rule(for: activity), rule.kind == "daily" else { return }
    OrbitScreenTimeStore.shield(rule)
  }
}
