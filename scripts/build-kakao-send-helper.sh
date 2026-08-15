#!/bin/zsh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$PROJECT_DIR/scripts/kakao-send.swift"
BIN_DIR="${KAKAOGUI_BIN_DIR:-$HOME/.kakaocli/bin}"
TARGET="$BIN_DIR/kakao-send"

mkdir -p "$BIN_DIR"

if [ ! -x "$TARGET" ] || [ "$SOURCE" -nt "$TARGET" ]; then
  TEMP_TARGET="$TARGET.tmp.$$"
  trap 'rm -f "$TEMP_TARGET"' EXIT
  xcrun swiftc \
    -O \
    -framework AppKit \
    -framework ApplicationServices \
    -framework Foundation \
    "$SOURCE" \
    -o "$TEMP_TARGET"
  chmod 755 "$TEMP_TARGET"
  mv "$TEMP_TARGET" "$TARGET"
  trap - EXIT
fi

echo "$TARGET"
