#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
export NODE_ENV="${NODE_ENV:-development}"

require_dependencies
require_xcode

if [[ ! -d ios ]]; then
  CI=1 npx expo prebuild --platform ios --no-install
fi
(cd ios && pod install)

IOS_SCHEME="${ORBIT_IOS_SCHEME:-Orbit}"
IOS_WORKSPACE="${ORBIT_IOS_WORKSPACE:-ios/Orbit.xcworkspace}"
[[ -d "$IOS_WORKSPACE" ]] || fail "Xcode workspace $IOS_WORKSPACE is missing. Set ORBIT_IOS_WORKSPACE and ORBIT_IOS_SCHEME for a custom project."
mkdir -p releases/ios/validation
xcodebuild \
  -workspace "$IOS_WORKSPACE" \
  -scheme "$IOS_SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath releases/ios/validation/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build

APP_PATH="releases/ios/validation/DerivedData/Build/Products/Debug-iphonesimulator/$IOS_SCHEME.app"
[[ -d "$APP_PATH" ]] || fail 'The build did not produce the expected simulator application.'
ditto -c -k --keepParent "$APP_PATH" releases/ios/Orbit-simulator.zip
node scripts/write-release-manifest.mjs ios-simulator releases/ios/Orbit-simulator.zip
printf '\nSimulator-only artifact: releases/ios/Orbit-simulator.zip\n'
