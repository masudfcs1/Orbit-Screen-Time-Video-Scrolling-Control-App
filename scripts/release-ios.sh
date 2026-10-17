#!/usr/bin/env bash
# ==============================================================================
# Orbit iOS Build & Release Script
# Builds unsigned iOS Simulator packages or signed production archives and IPAs
# ==============================================================================
set -euo pipefail
source "$(dirname "$0")/common.sh"

BUILD_TYPE="release" # release | simulator | archive-only

usage() {
  cat <<EOF
Usage: bash scripts/release-ios.sh [OPTIONS]

Options:
  --simulator, --sim   Build unsigned iOS Simulator package (.zip) for local testing
  --archive-only       Archive Xcode project without exporting .ipa
  -h, --help           Show this help message

Environment variables / configuration:
  ORBIT_APPLE_TEAM_ID             Apple Developer Team ID (e.g. ABC123DEF4)
  ORBIT_IOS_EXPORT_OPTIONS_PLIST  Path to ExportOptions.plist (defaults to ExportOptions.plist)
  ORBIT_IOS_SCHEME                Xcode scheme name (default: Orbit)
  ORBIT_IOS_WORKSPACE             Xcode workspace path (default: ios/Orbit.xcworkspace)

Run 'npm run build:ios:simulator' to build for simulator without an Apple account.
Run 'npm run ios:export-options' to generate an ExportOptions.plist.
EOF
  exit 0
}

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator|--sim)
      BUILD_TYPE="simulator"
      shift
      ;;
    --archive-only)
      BUILD_TYPE="archive-only"
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      fail "Unknown option: $1. Run 'bash scripts/release-ios.sh --help' for usage."
      ;;
  esac
done

# If simulator build requested, delegate to validate-ios.sh
if [[ "$BUILD_TYPE" == "simulator" ]]; then
  exec bash "$(dirname "$0")/validate-ios.sh"
fi

export NODE_ENV="${NODE_ENV:-production}"

# Load credentials from environment files if available
load_signing_env() {
  local file="$1"
  if [[ -f "$file" ]]; then
    while IFS='=' read -r key val || [[ -n "$key" ]]; do
      key="$(echo "$key" | tr -d '[:space:]')"
      val="$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')"
      if [[ -z "$key" || "$key" =~ ^# ]]; then continue; fi
      case "$key" in
        ORBIT_APPLE_TEAM_ID|APPLE_TEAM_ID|DEVELOPMENT_TEAM)
          export ORBIT_APPLE_TEAM_ID="${ORBIT_APPLE_TEAM_ID:-$val}"
          ;;
        ORBIT_IOS_EXPORT_OPTIONS_PLIST)
          export ORBIT_IOS_EXPORT_OPTIONS_PLIST="${ORBIT_IOS_EXPORT_OPTIONS_PLIST:-$val}"
          ;;
      esac
    done < "$file"
  fi
}

load_signing_env "$ORBIT_ROOT/.env.signing"
load_signing_env "$ORBIT_ROOT/.env.local"
load_signing_env "$ORBIT_ROOT/.env"

# Auto-detect ExportOptions.plist if not explicitly passed
if [[ -z "${ORBIT_IOS_EXPORT_OPTIONS_PLIST:-}" ]]; then
  if [[ -f "$ORBIT_ROOT/ExportOptions.plist" ]]; then
    export ORBIT_IOS_EXPORT_OPTIONS_PLIST="$ORBIT_ROOT/ExportOptions.plist"
  elif [[ -f "$ORBIT_ROOT/ios/ExportOptions.plist" ]]; then
    export ORBIT_IOS_EXPORT_OPTIONS_PLIST="$ORBIT_ROOT/ios/ExportOptions.plist"
  elif [[ -f "$ORBIT_ROOT/templates/ios/ExportOptions.app-store.plist" ]]; then
    export ORBIT_IOS_EXPORT_OPTIONS_PLIST="$ORBIT_ROOT/templates/ios/ExportOptions.app-store.plist"
  fi
fi

# Try extracting Team ID from ExportOptions.plist if still unset
if [[ -z "${ORBIT_APPLE_TEAM_ID:-}" && -f "${ORBIT_IOS_EXPORT_OPTIONS_PLIST:-}" ]]; then
  if command -v plutil >/dev/null 2>&1; then
    EXTRACTED_TEAM_ID="$(plutil -extract teamID raw "$ORBIT_IOS_EXPORT_OPTIONS_PLIST" 2>/dev/null || true)"
    if [[ -n "$EXTRACTED_TEAM_ID" ]]; then
      export ORBIT_APPLE_TEAM_ID="$EXTRACTED_TEAM_ID"
    fi
  fi
fi

require_dependencies
require_xcode

# Check credentials with helpful guidance
if [[ -z "${ORBIT_APPLE_TEAM_ID:-}" ]]; then
  printf "\n\033[1;31mError: Missing Apple Team ID (ORBIT_APPLE_TEAM_ID).\033[0m\n\n" >&2
  printf "To configure signing and export options, run:\n" >&2
  printf "  \033[1m npm run ios:export-options\033[0m\n\n" >&2
  printf "Or build an unsigned iOS Simulator package (no Apple Developer account required):\n" >&2
  printf "  \033[1m npm run build:ios:simulator\033[0m\n\n" >&2
  printf "Or build in the cloud with EAS Build:\n" >&2
  printf "  \033[1m npx eas-cli build -p ios --profile preview\033[0m\n\n" >&2
  exit 1
fi

if [[ ! -f "${ORBIT_IOS_EXPORT_OPTIONS_PLIST:-}" ]]; then
  printf "\n\033[1;31mError: ExportOptions.plist not found.\033[0m\n\n" >&2
  printf "Generate one with:\n" >&2
  printf "  \033[1m npm run ios:export-options\033[0m\n\n" >&2
  exit 1
fi

IOS_SCHEME="${ORBIT_IOS_SCHEME:-Orbit}"
IOS_WORKSPACE="${ORBIT_IOS_WORKSPACE:-ios/Orbit.xcworkspace}"

# Ensure iOS native workspace is generated if missing
if [[ ! -d "$IOS_WORKSPACE" ]]; then
  printf "Generating iOS native workspace via Expo prebuild...\n"
  CI=1 npx expo prebuild --platform ios --no-install
fi

printf "Running CocoaPods install...\n"
(cd ios && pod install)
mkdir -p releases/ios/export

APP_VERSION="$(node -p "require('./package.json').version || '1.0.0'")"

printf "\n\033[1;34mArchiving iOS Release Target (%s)...\033[0m\n" "$IOS_SCHEME"
xcodebuild \
  -workspace "$IOS_WORKSPACE" \
  -scheme "$IOS_SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath releases/ios/Orbit.xcarchive \
  DEVELOPMENT_TEAM="$ORBIT_APPLE_TEAM_ID" \
  archive

if [[ "$BUILD_TYPE" == "archive-only" ]]; then
  printf "\n\033[1;32m✔ iOS Archive completed successfully:\033[0m releases/ios/Orbit.xcarchive\n"
  exit 0
fi

printf "\n\033[1;34mExporting IPA with %s...\033[0m\n" "$ORBIT_IOS_EXPORT_OPTIONS_PLIST"
xcodebuild \
  -exportArchive \
  -archivePath releases/ios/Orbit.xcarchive \
  -exportPath releases/ios/export \
  -exportOptionsPlist "$ORBIT_IOS_EXPORT_OPTIONS_PLIST"

EXPORTED_IPA=(releases/ios/export/*.ipa)
[[ -f "${EXPORTED_IPA[0]:-}" ]] || fail "xcodebuild exportArchive completed without generating an .ipa file."

# Create versioned copy
VERSIONED_IPA="releases/ios/export/Orbit-v${APP_VERSION}.ipa"
cp "${EXPORTED_IPA[0]}" "$VERSIONED_IPA"

node scripts/write-release-manifest.mjs ios-release "${EXPORTED_IPA[0]}"

IPA_SIZE="$(du -h "${EXPORTED_IPA[0]}" | awk '{print $1}')"

printf "\n\033[1;32m✔ iOS Release build exported successfully!\033[0m\n"
printf "  • Archive:       releases/ios/Orbit.xcarchive\n"
printf "  • Exported IPA:  %s (%s)\n" "${EXPORTED_IPA[0]}" "$IPA_SIZE"
printf "  • Versioned IPA: %s\n" "$VERSIONED_IPA"
printf "  • Ready for TestFlight / App Store submission via Transporter or:\n"
printf "    \033[1m xcrun altool --upload-app -f %s -t ios -u <APPLE_ID> -p <APP_SPECIFIC_PASSWORD>\033[0m\n\n" "${EXPORTED_IPA[0]}"
