#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <dmg-path> <rust-target>" >&2
  exit 2
fi

DMG_INPUT=$1
TARGET=$2
APP_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

case "$TARGET" in
  aarch64-apple-darwin)
    EXPECTED_ARCH=arm64
    ;;
  x86_64-apple-darwin)
    EXPECTED_ARCH=x86_64
    ;;
  *)
    echo "Unsupported macOS target: $TARGET" >&2
    exit 2
    ;;
esac

if [[ ! -f "$DMG_INPUT" ]]; then
  echo "DMG does not exist: $DMG_INPUT" >&2
  exit 1
fi

DMG_PATH=$(cd "$(dirname "$DMG_INPUT")" && pwd)/$(basename "$DMG_INPUT")
MOUNT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bifrostwrite-dmg.XXXXXX")
MOUNTED=0

cleanup() {
  if [[ $MOUNTED -eq 1 ]]; then
    hdiutil detach "$MOUNT_DIR" -force >/dev/null 2>&1 || true
  fi
  rmdir "$MOUNT_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$MOUNT_DIR" >/dev/null
MOUNTED=1

APP_PATH=$(find "$MOUNT_DIR" -maxdepth 1 -type d -name 'BifrostWrite.app' -print -quit)
test -n "$APP_PATH"

APP_BINARY="$APP_PATH/Contents/MacOS/bifrostwrite"
SIDECAR="$APP_PATH/Contents/Resources/native-backend/neverwrite-native-backend"
test -x "$APP_BINARY"
test -x "$SIDECAR"
test ! -e "$APP_PATH/Contents/Frameworks/Electron Framework.framework"

ARCHS=" $(lipo -archs "$APP_BINARY") "
if [[ "$ARCHS" != *" $EXPECTED_ARCH "* ]]; then
  echo "BifrostWrite executable architectures '$ARCHS' do not include $EXPECTED_ARCH" >&2
  exit 1
fi

codesign --verify --deep --strict "$APP_PATH"
du -sh "$APP_PATH"

BIFROSTWRITE_TAURI_RELEASE_TARGET="$TARGET" \
BIFROSTWRITE_PACKAGED_SIDECAR_PATH="$SIDECAR" \
  node "$APP_ROOT/scripts/smoke-packaged-sidecar.mjs"
