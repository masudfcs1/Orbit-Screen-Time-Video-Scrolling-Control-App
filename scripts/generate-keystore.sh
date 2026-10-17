#!/usr/bin/env bash
# ==============================================================================
# Orbit Android Keystore Generator
# Generates an industry-standard PKCS12 release keystore and keystore.properties
# ==============================================================================
set -euo pipefail
source "$(dirname "$0")/common.sh"

KEYSTORE_DIR="$ORBIT_ROOT/android"
KEYSTORE_PATH="$KEYSTORE_DIR/orbit-release.keystore"
PROPERTIES_PATH="$ORBIT_ROOT/keystore.properties"
ENV_PATH="$ORBIT_ROOT/.env.signing"

require_command keytool

printf "\n\033[1;34m=== Orbit Android Release Keystore Generator ===\033[0m\n\n"

if [[ -f "$KEYSTORE_PATH" ]]; then
  printf "\033[1;33mWarning: Keystore already exists at:\033[0m %s\n" "$KEYSTORE_PATH"
  read -rp "Do you want to overwrite it? [y/N]: " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    printf "Keystore generation cancelled.\n"
    exit 0
  fi
fi

# Configuration parameters
DEFAULT_ALIAS="orbit-release-key"
read -rp "Enter Key Alias [default: $DEFAULT_ALIAS]: " KEY_ALIAS
KEY_ALIAS="${KEY_ALIAS:-$DEFAULT_ALIAS}"

read -rsp "Enter Keystore Password (leave empty to generate secure random): " KEY_PASSWORD
printf "\n"

if [[ -z "$KEY_PASSWORD" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    KEY_PASSWORD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)
  else
    KEY_PASSWORD=$(head -c 16 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)
  fi
  printf "\033[1;32mGenerated secure password:\033[0m %s\n" "$KEY_PASSWORD"
  printf "\033[1;33m(Save this password securely in your password manager!)\033[0m\n\n"
else
  read -rsp "Confirm Keystore Password: " KEY_PASSWORD_CONFIRM
  printf "\n"
  if [[ "$KEY_PASSWORD" != "$KEY_PASSWORD_CONFIRM" ]]; then
    fail "Passwords do not match."
  fi
fi

DEFAULT_DNAME="CN=Orbit, OU=Mobile, O=Orbit, L=San Francisco, ST=California, C=US"
read -rp "Enter Certificate distinguished name (DName) [default: $DEFAULT_DNAME]: " USER_DNAME
DNAME="${USER_DNAME:-$DEFAULT_DNAME}"

printf "\nGenerating PKCS12 keystore at: %s ...\n" "$KEYSTORE_PATH"

mkdir -p "$KEYSTORE_DIR"
keytool -genkeypair -v \
  -keystore "$KEYSTORE_PATH" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storetype PKCS12 \
  -storepass "$KEY_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "$DNAME"

chmod 600 "$KEYSTORE_PATH"

# Write standard Android keystore.properties (relative to android/app or root)
cat > "$PROPERTIES_PATH" <<EOF
# Android Keystore configuration - DO NOT COMMIT THIS FILE TO GIT
storeFile=$KEYSTORE_PATH
storePassword=$KEY_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF
chmod 600 "$PROPERTIES_PATH"

# Also write .env.signing format for terminal export / CI reference
cat > "$ENV_PATH" <<EOF
# Orbit Android Signing Environment Variables
export ORBIT_ANDROID_KEYSTORE_PATH="$KEYSTORE_PATH"
export ORBIT_ANDROID_KEYSTORE_PASSWORD="$KEY_PASSWORD"
export ORBIT_ANDROID_KEY_ALIAS="$KEY_ALIAS"
export ORBIT_ANDROID_KEY_PASSWORD="$KEY_PASSWORD"
EOF
chmod 600 "$ENV_PATH"

printf "\n\033[1;32m✔ Keystore generated successfully!\033[0m\n"
printf "  • Keystore file: %s\n" "$KEYSTORE_PATH"
printf "  • Properties:    %s\n" "$PROPERTIES_PATH"
printf "  • Environment:   %s\n" "$ENV_PATH"
printf "\n\033[1;34mNext steps:\033[0m\n"
printf "  1. To build a signed release APK immediately, run:\n"
printf "     \033[1m npm run build:apk:release\033[0m\n\n"
printf "  2. For CI/CD (GitHub Actions), convert your keystore to base64:\n"
printf "     \033[1m base64 < \"%s\" | pbcopy\033[0m (macOS) or \033[1mbase64 -w 0 \"%s\"\033[0m (Linux)\n" "$KEYSTORE_PATH" "$KEYSTORE_PATH"
printf "     and set secret \033[1mANDROID_KEYSTORE_BASE64\033[0m in GitHub repository settings.\n\n"
