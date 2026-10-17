#!/usr/bin/env bash
# Shared release helpers. These scripts never print signing credentials.
set -euo pipefail

ORBIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ORBIT_ROOT"

fail() { printf 'Orbit: %s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || fail "Missing $1. See README.md for build prerequisites."; }
require_variable() { [[ -n "${!1:-}" ]] || fail "Required environment variable $1 is not set."; }
require_dependencies() {
  require_command node
  require_command npm
  [[ -d node_modules ]] || fail 'Install the locked dependencies with npm ci first.'
}
require_xcode() {
  require_command xcodebuild
  xcodebuild -version >/dev/null 2>&1 || fail 'A full Xcode installation must be selected with xcode-select. Command Line Tools alone cannot build iOS.'
  require_command pod
}
