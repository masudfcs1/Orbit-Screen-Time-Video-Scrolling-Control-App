# Configure the optional Apple extensions

The app builds without these extensions and accurately reports Screen Time blocking and Live Activities as unavailable. The Swift files here are implementation sources, **not evidence that an extension is built, signed, embedded, or approved by Apple**. The config plugin configures the host app; it does not create Xcode targets.

Use a custom development build on a physical iPhone. Expo Go cannot load this module. Expo SDK 57 and the pod require iOS 16.4 or later; keep a higher deployment version if required by a future Expo / React Native SDK.

## 1. Enable host configuration

Replace the existing plugin entry in `app.json`:

```json
["./modules/orbit-device/app.plugin.js", {
  "enableScreenTime": true,
  "enableLiveActivities": true,
  "appGroup": "group.dev.orbit.screen"
}]
```

Register that App Group for your own Apple Developer team; the identifier above is an example and cannot be shared across unrelated teams. Run `npx expo prebuild --platform ios`. Open the generated workspace. Use the same team on the host and extension targets. Do not re-run clean prebuild after manually adding extension targets without preserving those target changes in your native project; clean prebuild removes manual native configuration.

## 2. Add the Device Activity Monitor target

1. In Xcode, add a **Device Activity Monitor Extension** named `OrbitActivityMonitor`; use bundle ID `dev.orbit.screen.OrbitActivityMonitor` (or your host ID followed by `.OrbitActivityMonitor`).
2. Replace its generated implementation with `OrbitActivityMonitor/OrbitActivityMonitor.swift`.
3. Add `../Shared/OrbitScreenTimeStore.swift` from the parent `ios` folder to this target's source membership. Do not add `OrbitDeviceModule.swift`, the widget `@main`, or Expo to the extension target.
4. Use the supplied `OrbitActivityMonitor/Info.plist` and `OrbitActivityMonitor/OrbitActivityMonitor.entitlements`; set build setting `ORBIT_APP_GROUP` to your registered App Group. `CODE_SIGN_ENTITLEMENTS` must point at the supplied entitlements file. Set `INFOPLIST_FILE` and disable generated Info.plist if using this file.
5. Enable **Family Controls** and the matching **App Groups** capability on both host and monitor. The correct extension point is `com.apple.deviceactivity.monitor-extension`.
6. Match deployment target, marketing version and build number with the host. Ensure the target is a host dependency and is in **Embed App Extensions**, signed on copy.
7. For distribution, request Apple's Family Controls distribution entitlement for the host **and** monitor identifiers, then regenerate their provisioning profiles after approval.

The module checks for the embedded extension, a reachable signed App Group, and authorization. Adding an Info.plist flag alone never enables blocking.

Request `requestScreenTimeAuthorization()`, then `presentScreenTimePicker()`. Application tokens never leave the native layer. Call `syncRestrictions` using `appIds: ["ios-selection"]`; a rule targets the entire private selection. The current shared app-ID UI is Android-oriented, so an iOS selection-specific rule editor is required to expose this API safely. Android IDs are deliberately rejected on iOS.

Native schedules support intervals of at least 15 minutes. Recurring weekdays are 0 for Sunday through 6 for Saturday; each selected weekday consumes one of Apple's monitored-activity slots. At most 20 registrations are attempted. Daily thresholds aggregate the selected apps and require iOS 17.4's `includesPastActivity` initializer. Rules use independent ManagedSettings stores so clearing one rule preserves other overlapping shields. Schedule callbacks are delivered by the OS when the device is in use; they are not exact background timers. Device Activity preserves registered monitoring across app process termination, subject to authorization and OS behavior. Test reboot and DST behavior on the actual supported iOS versions.

## 3. Add the widget / Live Activity target

1. Add a Widget Extension named `OrbitLiveActivity`, with bundle ID ending in `.OrbitLiveActivity`. Include Live Activity support and remove the generated widget `@main` declaration.
2. Add `OrbitLiveActivity/OrbitLiveActivity.swift` and `../Shared/OrbitActivityAttributes.swift` to its target membership. The shared attributes file must compile identically in host and widget.
3. Use `OrbitLiveActivity/Info.plist`. Match the host deployment version (minimum 16.4), marketing version, and build number. Embed the signed widget in the host.
4. Confirm `NSSupportsLiveActivities` is enabled on the host. A Family Controls entitlement is not required just for ActivityKit; do not add invented ActivityKit entitlements.

`startNativeCountdown` starts a user-initiated wall-clock activity while Orbit is foreground. SwiftUI's timer rendering updates remaining time without per-second JavaScript or network requests. The system decides Dynamic Island eligibility and presentation. A completion notification is scheduled if permitted. On expiration the content becomes stale; the app ends expired activities on its next foreground. No exact background dismissal or monitoring of another app's foreground is promised.

The widget opens `orbit://focus`. There are no remote push updates and no server. The compact presentation has a countdown; the minimal presentation uses the Orbit mark. iOS can show other activities instead or remove the activity at its discretion.

## 4. Verify on device before release

- Deny, grant and revoke Screen Time authorization; verify truthful capability changes.
- Save a private app selection, enable one temporary shield, and open an affected app.
- Test overlapping schedules, an overnight weekday boundary, daily threshold, cancellation, restart, device reboot, and a local time-zone change.
- Test notification-denied and Live-Activities-disabled states independently.
- Start, expire, dismiss, and stop the Live Activity from the host; inspect Lock Screen, compact, expanded and minimal presentations on a supported physical device.
- Inspect the signed archive's embedded extension identifiers, entitlements, shared group and provisioning profiles. Unsigned simulator compilation cannot validate these capabilities.

See `docs/PLATFORM_CAPABILITIES.md` for official API and policy references.
