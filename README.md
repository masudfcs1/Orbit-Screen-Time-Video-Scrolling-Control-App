# Orbit — Screen-Time & Video Scrolling Control App

**Make room for real life.** A local-first digital wellbeing app built with React Native, Expo, and TypeScript. Orbit combines a calm, editorial dashboard with screen-time insights, app allowances, scheduled restrictions, focus countdowns, and portable local backups.

The web experience is useful for exploring the interface and managing local records. Monitoring or restricting another application requires a native development build and the relevant operating-system authorization. Exact Reels, Shorts, and TikTok video counts are not available through standard Android or iOS usage APIs, so Orbit does not manufacture them.

## Run locally

Use **Node.js 22.13 or later** and npm. The repository's `package-lock.json` is authoritative.

```sh
npm ci
npm run web
```

Open the local address printed by Expo. For a native development build:

```sh
npm run android
# macOS with full Xcode and CocoaPods:
npm run ios
```

Android requires JDK 17, Android Studio's SDK, `ANDROID_HOME`, and a connected device or emulator. iOS requires full Xcode with an installed iOS SDK and CocoaPods; Apple's Command Line Tools alone are insufficient. Expo Go cannot load Orbit's local native module. A development build is required for native usage access, blocking, and Live Activities.

The interface supports light and dark appearance, responsive layouts, and reduced-motion preferences. Development builds offer a clearly identified sample experience. Production builds start with empty personal records and cannot enable sample mode. Sample activity is kept separate from personal usage records and excluded from personal backups.

## What works on each platform

| Capability | Android development build | iOS development build | Web |
| --- | --- | --- | --- |
| Local analytics, goals, focus timer, settings | Yes | Yes | Yes |
| Persistence | SQLite | SQLite | Browser local storage |
| JSON backup export/import | Native document picker/share flow | Native document picker/share flow | Browser file download/upload |
| Foreground application sessions | Usage Access permission required | No unrestricted per-app history export | Unavailable |
| Blocking other applications | Explicitly enabled accessibility service | Native source included; signed Screen Time setup and a selection-specific editor are required | Unavailable |
| Native countdown presentation | Notification permission required | Completion notification; ActivityKit requires an embedded, signed widget extension | In-app countdown |
| Exact individual video counts | Unavailable | Unavailable | Unavailable |

Read [platform capabilities and setup](docs/PLATFORM_CAPABILITIES.md) before testing or distributing native features. Native source code and bridge methods are included, but provisioning-dependent integrations are reported unavailable until their native requirements are satisfied. The app does not treat saving a limit as proof that the operating system is enforcing it.

The current App Limits editor targets the four supported Android application identities. Apple's private picker uses opaque selections, so the optional iOS shield APIs require a separate selection-based editing route before that functionality can be offered through the interface.

On iOS, an ordinary application cannot observe which unrelated application is currently in the foreground. Accordingly, Orbit cannot guarantee a Dynamic Island countdown that appears only while a third-party video app is active. ActivityKit also gives the system control over presentation and dismissal.

## Permissions and privacy

- **Android Usage Access:** lets Orbit reconstruct supported apps' foreground sessions. Enable it in the system settings opened from Orbit. Revoking access stops further collection.
- **Android accessibility blocking:** requires a separate, explicit user action. The service watches package/window changes to enforce the user's restrictions; it is not an exact video counter. Review the service disclosure before enabling it.
- **Notifications:** enable them for the native Android countdown. A notification is not a substitute for an enforcement service.
- **iOS Screen Time:** Family Controls authorization and approved entitlements are required. App selection uses Apple's system picker rather than enumerating installed applications.

There is no required account, remote database, or external analytics backend. Usage records are stored locally. Exported backups contain personal usage records; their destination is chosen by the user through the device's file/share UI. Browser storage is specific to the browser and origin and can be removed by clearing site data.

Restrictions remain user controlled. Uninstalling or force-stopping the app, revoking permissions, device policies, and operating-system execution limits can affect enforcement. A successful simulator build does not verify a physical device's permissions, background behavior, or entitlement eligibility.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run export:web
```

Unit tests exercise the domain and bridge logic. Native source must additionally be compiled and tested on devices: granting/revoking permissions, switching between monitored applications, expiry, overlapping schedules, reboot, changes to the clock/time zone, and backup restoration are important acceptance cases. Test and CI commands are provided as reproducible checks, not as a claim that all native builds or device scenarios have already passed.

The architecture and persistence boundaries are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The dependency audit on **18 October 2026** found upstream advisories through Expo/Metro, Tailwind, and Xcode tooling. [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) have no published patched version at the time of that review. [postcss-selector-parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) and [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) have patched versions, but the installed parent dependencies require older major versions. Recheck with `npm audit` before distribution and validate any targeted dependency override with the web and native builds. Do not apply `npm audit fix --force` blindly: its proposed fixes can downgrade the Expo/React Native stack to incompatible releases. The project does not claim a clean dependency audit.

## Local Android artifacts

A debug build needs no private signing credentials:

```sh
bash scripts/release-android.sh --debug
```

It writes `releases/android/app-debug.apk`. This is a development artifact. The release script refuses to produce a nominal release using Expo's default debug signing configuration.

For a signed release, provide these environment variables from your local secret manager or terminal session:

| Variable | Value |
| --- | --- |
| `ORBIT_ANDROID_KEYSTORE_PATH` | Absolute path to your existing release/upload keystore |
| `ORBIT_ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ORBIT_ANDROID_KEY_ALIAS` | Signing key alias |
| `ORBIT_ANDROID_KEY_PASSWORD` | Signing key password |

```sh
npm run release:android
```

Successful builds write `releases/android/app-release.apk`, `releases/android/app-release.aab`, and a JSON manifest containing the app version, Git commit when available, artifact sizes, and SHA-256 checksums. Missing dependencies or signing inputs cause an explicit failure. Existing native projects are preserved; Expo prebuild runs only when the Android project is absent. If app configuration or a config plugin changes later, deliberately regenerate or update the native project before building again.

## iOS validation and release

```sh
# Unsigned simulator build; never an installable device IPA:
bash scripts/validate-ios.sh
```

The simulator artifact is `releases/ios/Orbit-simulator.zip`. Signed iOS releases require a prepared native workspace, signing identity, provisioning profiles for every target, and an appropriate `ExportOptions.plist`. Configure the `OrbitActivityMonitor` and `OrbitLiveActivity` targets following the native setup document, including the shared App Group and approved Family Controls entitlement where used.

Set `ORBIT_APPLE_TEAM_ID` and `ORBIT_IOS_EXPORT_OPTIONS_PLIST`, then run:

```sh
npm run release:ios
```

The archive is written to `releases/ios/Orbit.xcarchive` and exported IPA files to `releases/ios/export/`. The script intentionally does not create extension targets or request entitlement approval. `ORBIT_IOS_SCHEME` and `ORBIT_IOS_WORKSPACE` can override the default `Orbit` and `ios/Orbit.xcworkspace` names.

## GitHub Actions and versioned releases

| Workflow | Purpose |
| --- | --- |
| `ci.yml` | Locked dependency install, TypeScript, lint, tests, web export, preview artifact |
| `native-validation.yml` | Android debug APK and unsigned iOS simulator compilation, downloadable artifacts |
| `android-build.yml` | Manually requested debug or signed release Android build |
| `release.yml` | Validate a version tag, build signed Android artifacts, optionally build configured iOS targets, publish a GitHub release |

Create a GitHub environment named `release` and configure these secrets for Android:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore bytes.
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Optional signed iOS releases are disabled by default. To enable them:

1. Prepare and commit the iOS workspace with all required extension targets and signing settings, or add a reproducible workspace preparation step to the workflow. The default generated project alone does not satisfy this requirement. If native folders are ignored, explicitly adjust that policy for the prepared project.
2. Obtain the necessary Apple entitlement approvals and distribution profiles. Set repository variable `ORBIT_IOS_RELEASE_READY` to `true` only after validating that configuration.
3. Add `APPLE_TEAM_ID`, `IOS_CERTIFICATE_BASE64` (a signing `.p12`), `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILES_BASE64` (a base64 ZIP of all required `.mobileprovision` files), and `IOS_EXPORT_OPTIONS_BASE64` (base64 `ExportOptions.plist`) secrets.

The iOS signing helpers are restricted to ephemeral GitHub Actions runners. Temporary keychains, profiles, and certificate files are removed in an `always()` cleanup step. Do not commit any signing assets.

Before releasing, update both `package.json` and `app.json` to the same semantic version, increment Android `versionCode` and iOS `buildNumber`, complete the checks, then push the matching tag, for example `v1.0.0`. The release workflow fails when a version does not match or required Android signing credentials are absent. Artifacts are published only after the relevant build jobs succeed. Native compilation and device acceptance remain prerequisites for calling a release production ready.
