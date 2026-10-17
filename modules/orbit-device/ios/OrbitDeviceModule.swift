import ActivityKit
import ExpoModulesCore
import FamilyControls
import Foundation
import SwiftUI
import UIKit
import UserNotifications

public final class OrbitDeviceModule: Module {
  private let notifications = UNUserNotificationCenter.current()
  private let notificationID = "orbit.focus.countdown"

  private var screenTimeConfigured: Bool {
    Bundle.main.object(forInfoDictionaryKey: "OrbitScreenTimeEnabled") as? Bool == true && OrbitScreenTimeStore.shared != nil
  }

  private func hasExtension(_ suffix: String, point: String) -> Bool {
    guard let path = Bundle.main.builtInPlugInsURL,
          let files = try? FileManager.default.contentsOfDirectory(at: path, includingPropertiesForKeys: nil) else { return false }
    return files.contains { url in
      guard let bundle = Bundle(url: url), bundle.bundleIdentifier?.hasSuffix(suffix) == true,
            let extensionInfo = bundle.object(forInfoDictionaryKey: "NSExtension") as? [String: Any] else { return false }
      return extensionInfo["NSExtensionPointIdentifier"] as? String == point
    }
  }

  private var monitorConfigured: Bool {
    screenTimeConfigured && hasExtension(".OrbitActivityMonitor", point: "com.apple.deviceactivity.monitor-extension")
  }

  private var liveActivityConfigured: Bool {
    Bundle.main.object(forInfoDictionaryKey: "NSSupportsLiveActivities") as? Bool == true &&
      hasExtension(".OrbitLiveActivity", point: "com.apple.widgetkit-extension") && ActivityAuthorizationInfo().areActivitiesEnabled
  }

  private func checkScreenTime() throws {
    guard screenTimeConfigured else {
      throw OrbitDeviceFailure.unavailable("This build does not have the signed Family Controls entitlement and App Group. See the platform setup guide before enabling Screen Time.")
    }
  }

  public func definition() -> ModuleDefinition {
    Name("OrbitDevice")

    AsyncFunction("getCapabilities") { () async -> [String: Any] in
      let settings = await self.notifications.notificationSettings()
      let authorized = AuthorizationCenter.shared.authorizationStatus == .approved
      return [
        "platform": "ios", "nativeModuleAvailable": true,
        "usageTracking": false, "usageAccessGranted": false,
        "notificationsGranted": settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional,
        "countdownNotifications": true,
        "blocking": self.monitorConfigured, "blockingAccessGranted": self.monitorConfigured && authorized,
        "screenTimeAuthorized": authorized, "liveActivity": self.liveActivityConfigured, "exactVideoCounts": false,
        "limitations": [
          "Apple does not provide unrestricted app discovery or other apps' foreground sessions to this JavaScript bridge. Usage totals are not fabricated.",
          "Screen Time requires Apple's Family Controls entitlement, a shared App Group, your authorization, and an embedded Device Activity Monitor extension. This build reports shields unavailable unless these are configured.",
          "Apple's app picker returns private tokens. Restrictions apply to Selected iOS apps as one set; Android app IDs cannot select iOS applications.",
          "Device Activity restrictions have a minimum 15-minute monitoring interval and a 20-monitor system limit. Daily allowances require iOS 17.4 or later and aggregate the selected apps.",
          "Live Activities need the embedded Orbit widget extension and an eligible device. Without it, countdowns use a scheduled completion notification.",
          "A third-party app cannot reliably detect when another app is in the foreground on iOS. Orbit cannot hide or resume the Dynamic Island by the active video app. Live countdowns are explicitly user-started wall-clock timers.",
          "The system controls Live Activity presentation and background timing. Expired activities become stale; Orbit ends them on next foreground. Screen Time authorization can be revoked by the device owner."
        ]
      ]
    }

    AsyncFunction("requestUsageAccess") { () throws in
      throw OrbitDeviceFailure.unavailable("iOS does not offer Android Usage Access. Use Screen Time authorization and Apple's private app picker for supported restrictions.")
    }
    AsyncFunction("readUsageSessions") { (_: Double, _: Double) throws -> [[String: Any]] in
      throw OrbitDeviceFailure.unavailable("Apple does not expose other apps' foreground sessions to this integration. A Device Activity Report extension is needed for private on-device reports; it cannot populate this unrestricted usage database.")
    }
    AsyncFunction("discoverMonitoredApps") { () throws -> [[String: Any]] in
      throw OrbitDeviceFailure.unavailable("iOS app selection is private. Use Apple's Screen Time picker instead of installed-app discovery.")
    }
    AsyncFunction("requestNotificationPermission") { () async throws -> Bool in
      try await self.notifications.requestAuthorization(options: [.alert, .badge, .sound])
    }
    AsyncFunction("requestScreenTimeAuthorization") { () async throws in
      try self.checkScreenTime()
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
    }
    AsyncFunction("requestBlockingAccess") { (consent: Bool) async throws in
      guard consent else { throw OrbitDeviceFailure.unavailable("Read and accept the restriction disclosure first.") }
      try self.checkScreenTime()
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
    }

    AsyncFunction("presentScreenTimePicker") { (promise: Promise) in
      do {
        try self.checkScreenTime()
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
          throw OrbitDeviceFailure.unavailable("Authorize Screen Time before selecting applications.")
        }
        guard var presenter = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
          .flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else {
          throw OrbitDeviceFailure.unavailable("Open Orbit before choosing applications.")
        }
        while let presented = presenter.presentedViewController { presenter = presented }
        let controller = UIHostingController(rootView: OrbitSelectionView(selection: OrbitScreenTimeStore.selection, completion: { promise.resolve(nil) }))
        controller.isModalInPresentation = true
        presenter.present(controller, animated: true)
      } catch { promise.reject("SCREEN_TIME_UNAVAILABLE", error.localizedDescription) }
    }.runOnQueue(.main)

    AsyncFunction("syncRestrictions") { (payload: [String: Any]) throws in
      guard self.monitorConfigured else {
        throw OrbitDeviceFailure.unavailable("The signed Orbit Activity Monitor extension is missing. Restrictions cannot be enforced by this build.")
      }
      let data = try JSONSerialization.data(withJSONObject: payload["rules"] ?? [])
      let rules = try JSONDecoder().decode([OrbitRule].self, from: data)
      try OrbitScreenTimeStore.apply(rules)
    }

    AsyncFunction("startNativeCountdown") { (options: [String: Any]) async throws in
      guard let id = options["id"] as? String, let title = options["title"] as? String,
            let endTimestamp = options["endsAt"] as? Double else {
        throw OrbitDeviceFailure.unavailable("The countdown needs an ID, title, and end time.")
      }
      let end = Date(timeIntervalSince1970: endTimestamp / 1000)
      guard end.timeIntervalSinceNow > 0 && end.timeIntervalSinceNow <= 8 * 60 * 60 else {
        throw OrbitDeviceFailure.unavailable("The countdown must end within the next 8 hours.")
      }
      let settings = await self.notifications.notificationSettings()
      let canNotify = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
      guard canNotify || self.liveActivityConfigured else {
        throw OrbitDeviceFailure.unavailable("Enable notifications or use a build with the signed Live Activity widget to start a native countdown.")
      }
      await self.stopCountdown()
      if self.liveActivityConfigured {
        let attributes = OrbitActivityAttributes(sessionID: id, startedAt: Date())
        let state = OrbitActivityAttributes.ContentState(endsAt: end, title: title)
        _ = try Activity<OrbitActivityAttributes>.request(attributes: attributes, content: ActivityContent(state: state, staleDate: end), pushType: nil)
      }
      if canNotify {
        let content = UNMutableNotificationContent()
        content.title = "A little time, reclaimed."
        content.body = "Your \(title) countdown is complete."
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, end.timeIntervalSinceNow), repeats: false)
        do { try await self.notifications.add(UNNotificationRequest(identifier: self.notificationID, content: content, trigger: trigger)) }
        catch { await self.stopCountdown(); throw error }
      }
      UserDefaults.standard.set(["id": id, "title": title, "endsAt": endTimestamp], forKey: "orbitCountdown")
    }

    AsyncFunction("stopNativeCountdown") { () async in await self.stopCountdown() }
    AsyncFunction("getNativeCountdownState") { () async -> [String: Any]? in
      guard var state = UserDefaults.standard.dictionary(forKey: "orbitCountdown"), let endsAt = state["endsAt"] as? Double else { return nil }
      let remaining = endsAt - Date().timeIntervalSince1970 * 1000
      if remaining <= 0 { await self.stopCountdown(); return nil }
      state["remainingMs"] = remaining
      state["status"] = "running"
      return state
    }

    OnAppEntersForeground {
      Task {
        if let state = UserDefaults.standard.dictionary(forKey: "orbitCountdown"), let endsAt = state["endsAt"] as? Double,
           endsAt <= Date().timeIntervalSince1970 * 1000 { await self.stopCountdown() }
      }
    }
  }

  private func stopCountdown() async {
    notifications.removePendingNotificationRequests(withIdentifiers: [notificationID])
    notifications.removeDeliveredNotifications(withIdentifiers: [notificationID])
    for activity in Activity<OrbitActivityAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
    UserDefaults.standard.removeObject(forKey: "orbitCountdown")
  }
}

private struct OrbitSelectionView: View {
  @Environment(\.dismiss) private var dismiss
  @State var selection: FamilyActivitySelection
  @State private var errorMessage: String?
  var completion: () -> Void

  var body: some View {
    NavigationStack {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Your protected space")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { dismiss(); completion() }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Save") {
              do {
                let previous = OrbitScreenTimeStore.selection
                try OrbitScreenTimeStore.saveSelection(selection)
                do {
                  if !OrbitScreenTimeStore.rules.isEmpty { try OrbitScreenTimeStore.apply(OrbitScreenTimeStore.rules, force: true) }
                } catch {
                  try? OrbitScreenTimeStore.saveSelection(previous)
                  try? OrbitScreenTimeStore.apply(OrbitScreenTimeStore.rules, force: true)
                  throw error
                }
                dismiss(); completion()
              } catch { errorMessage = error.localizedDescription }
            }
          }
        }
        .alert("Selection could not be saved", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
          Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "Please try again.") }
    }
  }
}
