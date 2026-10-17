#!/usr/bin/env bash
# ==============================================================================
# Orbit Android Build & Release Script
# Builds debug or signed production APKs and App Bundles (AAB)
# ==============================================================================
set -euo pipefail
source "$(dirname "$0")/common.sh"

BUILD_TYPE="all" # all | apk | bundle | debug
TARGET_TASK=""

usage() {
  cat <<EOF
Usage: bash scripts/release-android.sh [OPTIONS]

Options:
  --debug          Build unsigned debug APK for local testing
  --apk            Build signed release APK only (faster, ready for sideloading/testing)
  --bundle         Build signed release Android App Bundle (.aab) for Google Play
  --all            Build both signed release APK and AAB (default release mode)
  -h, --help       Show this help message

Environment variables / keystore.properties:
  ORBIT_ANDROID_KEYSTORE_PATH       Path to release .keystore or .jks
  ORBIT_ANDROID_KEYSTORE_PASSWORD   Keystore password
  ORBIT_ANDROID_KEY_ALIAS           Key alias
  ORBIT_ANDROID_KEY_PASSWORD        Key password

Run 'npm run android:keystore' to generate a keystore automatically.
EOF
  exit 0
}

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      BUILD_TYPE="debug"
      shift
      ;;
    --apk)
      BUILD_TYPE="apk"
      shift
      ;;
    --bundle)
      BUILD_TYPE="bundle"
      shift
      ;;
    --all)
      BUILD_TYPE="all"
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      fail "Unknown option: $1. Run 'bash scripts/release-android.sh --help' for usage."
      ;;
  esac
done

if [[ "$BUILD_TYPE" == "debug" ]]; then
  export NODE_ENV="${NODE_ENV:-development}"
else
  export NODE_ENV="${NODE_ENV:-production}"
fi

require_dependencies
require_command java
java -version >/dev/null 2>&1 || fail 'Install JDK 17 and set JAVA_HOME to a working JDK.'
[[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]] || fail 'Set ANDROID_HOME to your Android SDK directory.'

# Helper to load properties from a key=value file
load_properties_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    while IFS='=' read -r key val || [[ -n "$key" ]]; do
      # strip whitespace and comments
      key="$(echo "$key" | tr -d '[:space:]')"
      val="$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      if [[ -z "$key" || "$key" =~ ^# ]]; then
        continue
      fi
      case "$key" in
        storeFile|ORBIT_ANDROID_KEYSTORE_PATH)
          export ORBIT_ANDROID_KEYSTORE_PATH="${ORBIT_ANDROID_KEYSTORE_PATH:-$val}"
          ;;
        storePassword|ORBIT_ANDROID_KEYSTORE_PASSWORD)
          export ORBIT_ANDROID_KEYSTORE_PASSWORD="${ORBIT_ANDROID_KEYSTORE_PASSWORD:-$val}"
          ;;
        keyAlias|ORBIT_ANDROID_KEY_ALIAS)
          export ORBIT_ANDROID_KEY_ALIAS="${ORBIT_ANDROID_KEY_ALIAS:-$val}"
          ;;
        keyPassword|ORBIT_ANDROID_KEY_PASSWORD)
          export ORBIT_ANDROID_KEY_PASSWORD="${ORBIT_ANDROID_KEY_PASSWORD:-$val}"
          ;;
      esac
    done < "$file"
  fi
}

# In release modes, auto-detect signing credentials if not already set
if [[ "$BUILD_TYPE" != "debug" ]]; then
  load_properties_file "$ORBIT_ROOT/keystore.properties"
  load_properties_file "$ORBIT_ROOT/android/keystore.properties"
  load_properties_file "$ORBIT_ROOT/.env.signing"
  load_properties_file "$ORBIT_ROOT/.env.local"
  load_properties_file "$ORBIT_ROOT/.env"

  MISSING_KEYS=()
  for variable in ORBIT_ANDROID_KEYSTORE_PATH ORBIT_ANDROID_KEYSTORE_PASSWORD ORBIT_ANDROID_KEY_ALIAS ORBIT_ANDROID_KEY_PASSWORD; do
    if [[ -z "${!variable:-}" ]]; then
      MISSING_KEYS+=("$variable")
    fi
  done

  if [[ ${#MISSING_KEYS[@]} -gt 0 ]]; then
    printf "\n\033[1;31mError: Missing release signing credentials:\033[0m\n" >&2
    for k in "${MISSING_KEYS[@]}"; do
      printf "  - %s\n" "$k" >&2
    done
    printf "\nTo create a release keystore automatically, run:\n" >&2
    printf "  \033[1m npm run android:keystore\033[0m\n\n" >&2
    printf "Or build an unsigned debug APK for testing with:\n" >&2
    printf "  \033[1m npm run build:apk:debug\033[0m\n\n" >&2
    exit 1
  fi

  [[ -f "$ORBIT_ANDROID_KEYSTORE_PATH" ]] || fail "The configured Android keystore does not exist at: $ORBIT_ANDROID_KEYSTORE_PATH"
  export ORBIT_ANDROID_KEYSTORE_PATH="$(cd "$(dirname "$ORBIT_ANDROID_KEYSTORE_PATH")" && pwd)/$(basename "$ORBIT_ANDROID_KEYSTORE_PATH")"
fi

# Ensure native project exists (run prebuild only if missing)
if [[ ! -f android/gradlew ]]; then
  printf "Generating Android native project via Expo prebuild...\n"
  CI=1 npx expo prebuild --platform android --no-install
fi

mkdir -p releases/android

# Read current app version from package.json
APP_VERSION="$(node -p "require('./package.json').version || '1.0.0'")"

# Execute Gradle build based on requested mode
if [[ "$BUILD_TYPE" == "debug" ]]; then
  printf "\n\033[1;34mBuilding Android Debug APK...\033[0m\n"
  (cd android && bash ./gradlew :app:assembleDebug --no-daemon)

  SRC_APK="android/app/build/outputs/apk/debug/app-debug.apk"
  [[ -f "$SRC_APK" ]] || fail "Gradle completed without producing the expected debug APK at $SRC_APK."

  DEST_APK="releases/android/app-debug.apk"
  DEST_VERSIONED="releases/android/Orbit-v${APP_VERSION}-debug.apk"
  cp "$SRC_APK" "$DEST_APK"
  cp "$SRC_APK" "$DEST_VERSIONED"
  node scripts/write-release-manifest.mjs android-debug "$DEST_APK"

  APK_SIZE="$(du -h "$DEST_APK" | awk '{print $1}')"
  printf "\n\033[1;32m✔ Debug APK generated successfully!\033[0m\n"
  printf "  • Location: %s (%s)\n" "$DEST_APK" "$APK_SIZE"
  printf "  • Versioned: %s\n" "$DEST_VERSIONED"
  printf "  • Install on connected device:\n"
  printf "    \033[1m adb install -r %s\033[0m\n\n" "$DEST_APK"

elif [[ "$BUILD_TYPE" == "apk" ]]; then
  printf "\n\033[1;34mBuilding Signed Android Release APK...\033[0m\n"
  (cd android && bash ./gradlew :app:assembleRelease --no-daemon --init-script "$ORBIT_ROOT/scripts/android-signing.gradle")

  SRC_APK="android/app/build/outputs/apk/release/app-release.apk"
  [[ -f "$SRC_APK" ]] || fail "Gradle completed without producing the expected signed release APK at $SRC_APK."

  DEST_APK="releases/android/app-release.apk"
  DEST_VERSIONED="releases/android/Orbit-v${APP_VERSION}-release.apk"
  cp "$SRC_APK" "$DEST_APK"
  cp "$SRC_APK" "$DEST_VERSIONED"
  node scripts/write-release-manifest.mjs android-release "$DEST_APK"

  APK_SIZE="$(du -h "$DEST_APK" | awk '{print $1}')"
  printf "\n\033[1;32m✔ Signed Release APK generated successfully!\033[0m\n"
  printf "  • Location:  %s (%s)\n" "$DEST_APK" "$APK_SIZE"
  printf "  • Versioned: %s\n" "$DEST_VERSIONED"
  printf "  • Install on connected device:\n"
  printf "    \033[1m adb install -r %s\033[0m\n\n" "$DEST_APK"

elif [[ "$BUILD_TYPE" == "bundle" ]]; then
  printf "\n\033[1;34mBuilding Signed Android App Bundle (AAB)...\033[0m\n"
  (cd android && bash ./gradlew :app:bundleRelease --no-daemon --init-script "$ORBIT_ROOT/scripts/android-signing.gradle")

  SRC_AAB="android/app/build/outputs/bundle/release/app-release.aab"
  [[ -f "$SRC_AAB" ]] || fail "Gradle completed without producing the expected signed release bundle at $SRC_AAB."

  DEST_AAB="releases/android/app-release.aab"
  DEST_VERSIONED="releases/android/Orbit-v${APP_VERSION}-release.aab"
  cp "$SRC_AAB" "$DEST_AAB"
  cp "$SRC_AAB" "$DEST_VERSIONED"
  node scripts/write-release-manifest.mjs android-bundle "$DEST_AAB"

  AAB_SIZE="$(du -h "$DEST_AAB" | awk '{print $1}')"
  printf "\n\033[1;32m✔ Signed App Bundle (AAB) generated successfully!\033[0m\n"
  printf "  • Location:  %s (%s)\n" "$DEST_AAB" "$AAB_SIZE"
  printf "  • Versioned: %s\n" "$DEST_VERSIONED"
  printf "  • Ready for Google Play Console upload.\n\n"

else
  # Default --all: build both APK and AAB
  printf "\n\033[1;34mBuilding Signed Android Release APK & App Bundle (AAB)...\033[0m\n"
  (cd android && bash ./gradlew :app:assembleRelease :app:bundleRelease --no-daemon --init-script "$ORBIT_ROOT/scripts/android-signing.gradle")

  SRC_APK="android/app/build/outputs/apk/release/app-release.apk"
  SRC_AAB="android/app/build/outputs/bundle/release/app-release.aab"
  [[ -f "$SRC_APK" ]] || fail "Gradle completed without the expected signed release APK."
  [[ -f "$SRC_AAB" ]] || fail "Gradle completed without the expected release bundle."

  DEST_APK="releases/android/app-release.apk"
  DEST_AAB="releases/android/app-release.aab"
  DEST_APK_VERSIONED="releases/android/Orbit-v${APP_VERSION}-release.apk"
  DEST_AAB_VERSIONED="releases/android/Orbit-v${APP_VERSION}-release.aab"

  cp "$SRC_APK" "$DEST_APK"
  cp "$SRC_AAB" "$DEST_AAB"
  cp "$SRC_APK" "$DEST_APK_VERSIONED"
  cp "$SRC_AAB" "$DEST_AAB_VERSIONED"

  node scripts/write-release-manifest.mjs android-release "$DEST_APK" "$DEST_AAB"

  APK_SIZE="$(du -h "$DEST_APK" | awk '{print $1}')"
  AAB_SIZE="$(du -h "$DEST_AAB" | awk '{print $1}')"

  printf "\n\033[1;32m✔ Signed Android artifacts generated successfully!\033[0m\n"
  printf "  • Release APK: %s (%s)\n" "$DEST_APK" "$APK_SIZE"
  printf "  • App Bundle:  %s (%s)\n" "$DEST_AAB" "$AAB_SIZE"
  printf "  • Install APK:\n"
  printf "    \033[1m adb install -r %s\033[0m\n\n" "$DEST_APK"
fi
