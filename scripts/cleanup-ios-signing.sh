#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ "${GITHUB_ACTIONS:-}" == 'true' && -n "${RUNNER_TEMP:-}" ]] || fail 'This helper is only for an ephemeral GitHub Actions macOS runner.'
SIGNING_DIR="$RUNNER_TEMP/orbit-signing"
if [[ -f "$SIGNING_DIR/installed-profiles.txt" ]]; then
  while IFS= read -r profile; do
    case "$profile" in
      "$HOME/Library/MobileDevice/Provisioning Profiles/"*.mobileprovision|"$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/"*.mobileprovision) rm -f "$profile" ;;
      *) fail 'Unexpected provisioning profile cleanup path.' ;;
    esac
  done < "$SIGNING_DIR/installed-profiles.txt"
fi
if [[ -f "$SIGNING_DIR/original-keychains.txt" ]]; then
  python3 - "$SIGNING_DIR/original-keychains.txt" <<'PY'
import pathlib, shlex, subprocess, sys
keychains = shlex.split(pathlib.Path(sys.argv[1]).read_text())
subprocess.run(['security', 'list-keychains', '-d', 'user', '-s', *keychains], check=True)
PY
fi
if [[ -f "$SIGNING_DIR/orbit-release.keychain-db" ]]; then
  security delete-keychain "$SIGNING_DIR/orbit-release.keychain-db"
fi
rm -rf "$SIGNING_DIR"
