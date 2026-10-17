#!/usr/bin/env bash
# ==============================================================================
# Orbit iOS ExportOptions Generator
# Configures ExportOptions.plist for App Store, Ad-Hoc, or Development IPA export
# ==============================================================================
set -euo pipefail
source "$(dirname "$0")/common.sh"

DESTINATION="${ORBIT_ROOT}/ExportOptions.plist"
METHOD="${1:-}"

if [[ -z "$METHOD" ]]; then
  printf "\n\033[1;34m=== Orbit iOS ExportOptions Generator ===\033[0m\n\n"
  printf "Select export method:\n"
  printf "  1) app-store    (Official App Store & TestFlight submission)\n"
  printf "  2) ad-hoc       (Install on registered devices via link/AirDrop)\n"
  printf "  3) development  (Local development device testing)\n\n"
  read -rp "Enter choice [1-3, default 1]: " CHOICE
  case "$CHOICE" in
    2) METHOD="ad-hoc" ;;
    3) METHOD="development" ;;
    *) METHOD="app-store" ;;
  esac
fi

TEMPLATE="${ORBIT_ROOT}/templates/ios/ExportOptions.${METHOD}.plist"
[[ -f "$TEMPLATE" ]] || fail "Template not found: $TEMPLATE"

read -rp "Enter Apple Team ID (e.g., ABC123DEF4, optional): " TEAM_ID

cp "$TEMPLATE" "$DESTINATION"

if [[ -n "$TEAM_ID" ]]; then
  # Inject teamID if provided
  if command -v plutil >/dev/null 2>&1; then
    plutil -replace teamID -string "$TEAM_ID" "$DESTINATION"
  fi
  # Also store in .env.signing
  printf "\nexport ORBIT_APPLE_TEAM_ID=\"%s\"\n" "$TEAM_ID" >> "${ORBIT_ROOT}/.env.signing"
fi

printf "\n\033[1;32m✔ ExportOptions.plist generated at:\033[0m %s\n" "$DESTINATION"
printf "  • Method: %s\n" "$METHOD"
if [[ -n "$TEAM_ID" ]]; then
  printf "  • Team ID: %s\n" "$TEAM_ID"
fi
printf "\nTo build signed IPA, run:\n"
printf "  \033[1m npm run build:ios:ipa\033[0m\n\n"
