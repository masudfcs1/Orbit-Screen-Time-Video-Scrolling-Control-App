# Architecture

Orbit separates the visual application, pure wellbeing calculations, local storage, and operating-system authority. This matters because a polished interface can run on the web while access to another app's usage or enforcement requires a specifically authorized native build.

## Application boundaries

```text
React Native UI
  ├─ Zustand application state
  │    ├─ Domain calculations: analytics, countdowns, recurring schedules
  │    └─ Persistence and backup services
  │         ├─ SQLite on Android/iOS
  │         └─ Browser storage on web
  └─ Device bridge: capabilities, permissions, sessions, restrictions
       └─ modules/orbit-device
            ├─ Android: UsageStatsManager, accessibility enforcement, notification
            └─ iOS: FamilyControls, ManagedSettings, DeviceActivity, ActivityKit
```

The UI treats native capabilities as data, not assumptions. A missing bridge, denied permission, unsupported runtime, or unconfigured extension must produce an unavailable or permission state. It must not produce a fake usage result or imply that a locally saved restriction has been enforced.

## Domain records

- Application records identify monitored applications and their display metadata.
- Usage sessions contain an application identifier and absolute start/end timestamps. Session duration is calculated from timestamp intersections with the requested range.
- App allowances are daily minute budgets. Recurring schedules use local wall-clock times and selected weekdays. Temporary focus restrictions use an absolute expiration time.
- Focus state retains the requested duration, end timestamp, pause information, and lifecycle status. Remaining time is derived from timestamps rather than decrementing an in-memory number on every tick.
- Preferences contain goals, appearance, countdown defaults, and notification choices.

Analytics never equate an app-open event or usage session with a video watched. No exact video-count source is available in the default platform integrations.

## Time and aggregation

Store instants as epoch milliseconds. Form day, week, and month windows using local calendar operations, then intersect usage sessions with those windows. A day is not assumed to always contain 86,400,000 milliseconds. A session that crosses midnight can contribute to more than one day's summary without being duplicated in storage.

Avoid collecting usage for arbitrary unrelated apps. The native Android bridge restricts queries to the monitored application set and segments foreground usage events. Native stable identifiers and the persistence layer's duplicate handling make repeated sync requests safe. A foreground session returned while an app remains open is provisional; follow-up synchronization may extend its end time.

Daily schedule evaluation uses the device's current local time zone. Overnight schedules connect the selected starting day with the following day. Overlapping enabled restrictions combine: one applicable rule is sufficient to restrict a selected application. Manual cancellation and permission revocation remain explicit state transitions.

## Persistence and backups

SQLite is the native source of persistent records. The web adapter uses local browser storage because this preview is not a source of device usage authority. Schema migrations and database writes belong below the UI layer. The store exposes application actions while persistence failures remain visible to the interface.

Backups are versioned JSON documents. Validate the entire payload, supported version, bounded numerical values, timestamp ordering, identifiers, and record relationships before changing live state. Merge imports must deduplicate records; replace imports require an explicit user decision. Native import mutations belong inside a transaction so a failed operation cannot leave half an imported dataset.

Demonstration data is an isolated, explicitly identified development-only state. Production builds ignore a persisted sample preference and reject attempts to enable sample mode. Switching to real tracking or restoring a personal backup never combines sample usage with actual records. Backups always use the personal local dataset.

## Native integration

The TypeScript device bridge provides a narrow, typed interface and validates inputs before crossing the native boundary. Capability checks can be refreshed after returning from system settings. Bridge failures should preserve the underlying error or show a helpful recovery state instead of being treated as successful permission requests.

Android monitoring requires Usage Access. Blocking is a separately consented accessibility service that responds to selected package/window changes. Countdown notifications are distinct from restrictions: a countdown may be visible without enforcing a limit. Reboot and clock-change recovery restore only the functionality that the current permissions and Android execution rules allow.

On iOS, Family Controls authorization and selection use system interfaces. Screen Time enforcement additionally requires the embedded DeviceActivity monitor target, matching App Group, entitlements, and provisioning. ActivityKit requires an embedded widget extension. Merely linking the Swift source or rendering a React Native countdown does not establish those capabilities.

Detailed setup and authoritative platform limitations are recorded in [PLATFORM_CAPABILITIES.md](PLATFORM_CAPABILITIES.md).

## Verification and delivery

Pure business logic is tested without native permissions. Bridge tests exercise unavailable runtimes and rejected native calls. Device builds and physical-device acceptance tests are separate requirements; JavaScript tests cannot establish entitlement approval or background-service behavior.

CI installs from the committed npm lockfile, runs TypeScript/lint/tests, exports the web application, and compiles separate Android debug and iOS simulator artifacts. Signed release workflows use secrets and explicit signing configuration. Local build scripts place successful outputs under `releases/` and write checksum manifests only for files that exist and are nonempty.

The generated native projects are preserved by build scripts. Config or native-plugin changes require a deliberate prebuild/update step; production iOS extension targets should never be discarded with an unreviewed clean prebuild.
