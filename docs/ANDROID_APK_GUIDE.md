# Android APK Professional Build Guide

This guide details the complete, production-grade workflow for generating, signing, and distributing Android APKs for **Orbit**.

---

## 🚀 Quick Command Reference

| Command | Description | Artifact Output |
| :--- | :--- | :--- |
| `npm run android:keystore` | Generates a PKCS12 release keystore and configures `keystore.properties` | `android/orbit-release.keystore`, `keystore.properties` |
| `npm run build:apk` | Builds an optimized, signed **Release APK** ready for sideloading & testing | `releases/android/app-release.apk` |
| `npm run build:apk:debug` | Builds an unsigned **Debug APK** (requires zero signing credentials) | `releases/android/app-debug.apk` |
| `npm run release:android` | Builds both **Release APK** and **Release AAB** (Google Play Store bundle) | `releases/android/app-release.apk` & `.aab` |

---

## 📦 APK Types: When to Use Which?

| Variant | Purpose | Key Characteristics |
| :--- | :--- | :--- |
| **Debug APK** | Local rapid prototyping & developer iteration | Contains React Native dev tools, unminified JS bundle, signed with generic Android debug key. |
| **Release APK** | Internal testing, QA, client demos, Firebase App Distribution, direct device install | Hermes bytecode optimized, minified with R8, signed with production upload key. Can be installed directly via `adb` or download link. |
| **Release AAB** (Bundle) | Official Google Play Store submissions | Contains compiled code and resources for all device architectures. Google Play dynamically generates device-tailored APKs on download. |

---

## 🛠️ Step-by-Step Implementation Workflows

### 1. One-Time Setup: Generate Production Keystore

To produce installable release APKs, Android requires cryptographic signing. We have automated this process:

```bash
npm run android:keystore
```

This interactive script:
1. Generates an industry-standard **PKCS12** keystore with **2048-bit RSA** and **10,000-day validity**.
2. Saves it to `android/orbit-release.keystore` with strict file permissions (`chmod 600`).
3. Automatically writes `keystore.properties` and `.env.signing` (both automatically ignored by `.gitignore`).

> [!SECURITY TIP]
> Never commit `*.keystore`, `*.jks`, or `keystore.properties` to version control. Store a backup of your keystore and password in your team's secure password manager (e.g., 1Password, Bitwarden, or AWS/GCP Secret Manager). If you lose this key, you cannot update existing installs signed with it.

---

### 2. Method A: Local Command-Line Build (Recommended)

Once your keystore is generated, run:

```bash
# 1. Build signed Release APK
npm run build:apk

# Or 2. Build unsigned Debug APK (no keystore needed)
npm run build:apk:debug
```

#### What happens during the build:
1. Verifies Java 17 and Android SDK environment.
2. Automatically loads signing credentials from `keystore.properties` or environment variables.
3. Precompiles JavaScript with Hermes bytecode optimization.
4. Assembles the APK and outputs to:
   - `releases/android/app-release.apk`
   - `releases/android/Orbit-v<VERSION>-release.apk` (versioned copy)
5. Computes a cryptographically verified SHA-256 build manifest in `releases/android/android-release-manifest.json`.

---

### 3. Method B: Cloud Builds with EAS Build

If you don't have the full Android SDK installed locally or want automated builds in the cloud:

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Build an installable APK in the cloud:
   ```bash
   eas build --platform android --profile preview
   ```
3. EAS will build the standalone APK on Expo's infrastructure and return a shareable download link and QR code to install directly on physical devices.

*(See [`eas.json`](file:///Users/f/Desktop/app-count/eas.json) for predefined profiles: `development`, `preview`, `production`, and `production-apk`).*

---

### 4. Method C: Automated GitHub Actions CI/CD

The repository includes [`.github/workflows/android-build.yml`](file:///Users/f/Desktop/app-count/.github/workflows/android-build.yml) for on-demand builds.

#### GitHub Setup:
1. In your GitHub repository, go to **Settings** > **Environments** > create an environment named `release`.
2. Add these repository secrets:
   - `ANDROID_KEYSTORE_BASE64`: Your keystore file encoded in base64.
     - On macOS: `base64 < android/orbit-release.keystore | pbcopy`
     - On Linux: `base64 -w 0 android/orbit-release.keystore`
   - `ANDROID_KEYSTORE_PASSWORD`: The password chosen during generation.
   - `ANDROID_KEY_ALIAS`: The key alias (e.g. `orbit-release-key`).
   - `ANDROID_KEY_PASSWORD`: The key password.

#### Triggering a Build:
1. Go to the **Actions** tab on GitHub.
2. Select **Android build on demand**.
3. Choose:
   - **variant**: `release` or `debug`
   - **format**: `apk` (for direct testing), `bundle` (for Play Store), or `all`.
4. Click **Run workflow**. The finished APK will be available in the workflow run's Artifacts.

---

## 📱 Installing & Testing on a Physical Android Device

### Option 1: Via ADB (Fastest for developers)
Enable **Developer Options** and **USB Debugging** on your Android phone, connect it via USB, and run:

```bash
adb install -r releases/android/app-release.apk
```

### Option 2: Direct File Transfer / Download
- Transfer `releases/android/app-release.apk` to the phone via USB file transfer, Google Drive, Slack, or local server.
- Open the file in the device's Files app and tap **Install** (allow *Install unknown apps* if prompted).
