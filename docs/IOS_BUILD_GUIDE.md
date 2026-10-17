# iOS Professional Build Guide

This guide details the complete, production-grade workflow for generating, signing, and distributing iOS builds (Simulator packages and signed IPAs) for **Orbit**.

---

## 🚀 Quick Command Reference

| Command | Description | Artifact Output |
| :--- | :--- | :--- |
| `npm run build:ios:simulator` | Builds an unsigned **iOS Simulator bundle** (Zero Apple account or signing needed) | `releases/ios/Orbit-simulator.zip` |
| `npm run ios:export-options` | Generates or configures `ExportOptions.plist` for App Store, Ad-Hoc, or Development | `ExportOptions.plist` |
| `npm run build:ios:ipa` | Builds a signed **Release Archive (.xcarchive)** and exports production **.ipa** | `releases/ios/Orbit.xcarchive`, `releases/ios/export/*.ipa` |
| `npm run release:ios` | Full release pipeline (archive + export IPA) | `releases/ios/export/*.ipa` |

---

## 📦 iOS Build Types: When to Use Which?

| Variant | Purpose | Prerequisites |
| :--- | :--- | :--- |
| **Simulator Bundle** (`.app` in `.zip`) | Fast testing, QA, UI validation, running on Mac iOS Simulator | Full Xcode (or EAS cloud). **No Apple Developer account or signing certificates required.** |
| **Ad-Hoc / Enterprise IPA** | Direct installation on registered physical test devices (via AirDrop, Apple Configurator, or MDM) | Apple Developer Program membership, device UDIDs registered in provisioning profile. |
| **App Store / TestFlight IPA** | Official distribution via Apple TestFlight beta and public App Store | Apple Developer Team ID, Distribution Certificate, App Store Provisioning Profile. |

---

## 🛠️ Step-by-Step Implementation Workflows

### 1. Zero-Config iOS Simulator Build (Fastest for Local Testing)

To build a simulator build locally without needing an Apple Developer account:

```bash
npm run build:ios:simulator
```

#### What happens:
1. Runs Expo prebuild for iOS if `ios/` workspace is absent.
2. Installs CocoaPods dependencies.
3. Compiles with `CODE_SIGNING_ALLOWED=NO` for the `iphonesimulator` SDK.
4. Packages the compiled `.app` into `releases/ios/Orbit-simulator.zip`.

#### Installing on your Simulator:
Unzip the file and drag `Orbit.app` directly onto your open iOS Simulator window, or run:
```bash
unzip -o releases/ios/Orbit-simulator.zip -d releases/ios/
xcrun simctl install booted releases/ios/Orbit.app
xcrun simctl launch booted dev.orbit.screen
```

---

### 2. Method B: Cloud Builds with EAS (No Local Mac or Xcode Required)

If your machine does not have a 40 GB Xcode installation, or if you are collaborating across a team, use Expo Application Services (EAS):

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Build for iOS Simulator in the cloud:
   ```bash
   eas build --platform ios --profile preview
   ```
   *EAS builds the simulator package and provides a direct download link and QR code.*

3. Build for TestFlight / App Store:
   ```bash
   eas build --platform ios --profile production
   ```
   *EAS automatically handles distribution certificates and provisioning profiles through Apple's API.*

*(See [`eas.json`](file:///Users/f/Desktop/app-count/eas.json) for predefined profiles).*

---

### 3. Method C: Signed Local IPA Export

To export a production `.ipa` locally:

1. **Generate your ExportOptions.plist**:
   ```bash
   npm run ios:export-options
   ```
   Select `app-store`, `ad-hoc`, or `development` and input your Apple Team ID.

2. **Run the build**:
   ```bash
   npm run build:ios:ipa
   ```

Outputs:
- Archive: `releases/ios/Orbit.xcarchive`
- Exported IPA: `releases/ios/export/Orbit-v<VERSION>.ipa`
- Cryptographic SHA-256 build manifest in `releases/ios/export/ios-release-manifest.json`

---

### 4. Method D: Automated GitHub Actions CI/CD

The repository includes [`.github/workflows/ios-build.yml`](file:///Users/f/Desktop/app-count/.github/workflows/ios-build.yml) for automated builds on GitHub's macOS runners.

#### Building on Demand:
1. Navigate to GitHub **Actions** > **iOS build on demand**.
2. Select:
   - **variant: simulator**: Runs on macOS runner with zero secrets, produces a downloadable `Orbit-simulator.zip`.
   - **variant: release**: Uses configured Apple certificates and profiles to produce a signed `.ipa`.
3. Click **Run workflow**.
