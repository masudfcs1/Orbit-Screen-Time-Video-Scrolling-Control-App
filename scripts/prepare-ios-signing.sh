#!/usr/bin/env bash
# Ephemeral GitHub-hosted macOS runner setup, not a local keychain installer.
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "${GITHUB_ACTIONS:-}" == 'true' && -n "${RUNNER_TEMP:-}" ]] || fail 'This helper is only for an ephemeral GitHub Actions macOS runner.'
for variable in IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROVISIONING_PROFILES_BASE64 IOS_EXPORT_OPTIONS_BASE64; do
  require_variable "$variable"
done
require_command security
require_command python3
require_command openssl

SIGNING_DIR="$RUNNER_TEMP/orbit-signing"
mkdir -p "$SIGNING_DIR"
chmod 700 "$SIGNING_DIR"
export SIGNING_DIR
umask 077

# Decode with Python so the command works on macOS without GNU base64 flags.
# Provisioning ZIP entries are flattened, so no archive path can escape this dir.
python3 - <<'PY'
import base64, io, os, pathlib, zipfile
root = pathlib.Path(os.environ['SIGNING_DIR'])
def decoded(variable):
    return base64.b64decode(''.join(os.environ[variable].split()), validate=True)
for variable, filename in [
    ('IOS_CERTIFICATE_BASE64', 'certificate.p12'),
    ('IOS_EXPORT_OPTIONS_BASE64', 'ExportOptions.plist'),
]:
    (root / filename).write_bytes(decoded(variable))
archive = zipfile.ZipFile(io.BytesIO(decoded('IOS_PROVISIONING_PROFILES_BASE64')))
profiles = [entry for entry in archive.infolist() if not entry.is_dir() and entry.filename.endswith('.mobileprovision')]
if not profiles:
    raise SystemExit('Provisioning ZIP must contain at least one .mobileprovision file.')
if len(profiles) > 20:
    raise SystemExit('Unexpectedly many provisioning profiles.')
for index, entry in enumerate(profiles):
    if entry.file_size > 2_000_000:
        raise SystemExit('Provisioning profile exceeds the size limit.')
    (root / f'profile-{index}.mobileprovision').write_bytes(archive.read(entry))
PY

security list-keychains -d user > "$SIGNING_DIR/original-keychains.txt"
KEYCHAIN_PATH="$SIGNING_DIR/orbit-release.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 32)"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$SIGNING_DIR/certificate.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH" >/dev/null
security list-keychains -d user -s "$KEYCHAIN_PATH"

for profile in "$SIGNING_DIR"/*.mobileprovision; do
  security cms -D -i "$profile" > "$SIGNING_DIR/profile.plist"
  PROFILE_UUID="$(python3 - "$SIGNING_DIR/profile.plist" <<'PY'
import plistlib, re, sys
with open(sys.argv[1], 'rb') as source:
    uuid = plistlib.load(source)['UUID']
if not re.fullmatch(r'[0-9A-Fa-f-]{36}', uuid):
    raise SystemExit('Invalid provisioning profile UUID.')
print(uuid)
PY
)"
  for profiles_directory in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$profiles_directory"
    destination="$profiles_directory/$PROFILE_UUID.mobileprovision"
    [[ ! -e "$destination" ]] || fail 'Refusing to overwrite an existing provisioning profile.'
    cp "$profile" "$destination"
    printf '%s\n' "$destination" >> "$SIGNING_DIR/installed-profiles.txt"
  done
done
rm -f "$SIGNING_DIR/certificate.p12" "$SIGNING_DIR/profile.plist" "$SIGNING_DIR"/*.mobileprovision
printf 'Imported temporary iOS signing assets.\n'
