#!/bin/zsh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/dist/macos"
APP_DIR="$BUILD_DIR/Kakao Inbox.app"
CONTENTS_DIR="$APP_DIR/Contents"
ICON_SOURCE_DIR="$(mktemp -d)"
ICONSET_DIR="$ICON_SOURCE_DIR/AppIcon.iconset"

trap 'rm -rf "$ICON_SOURCE_DIR"' EXIT
rm -rf "$BUILD_DIR"
mkdir -p "$CONTENTS_DIR/MacOS" "$CONTENTS_DIR/Resources" "$ICONSET_DIR"

xcrun swiftc \
  -O \
  -parse-as-library \
  -target arm64-apple-macos13.0 \
  -framework AppKit \
  -framework Foundation \
  -framework WebKit \
  "$PROJECT_DIR/macos/KakaoInbox.swift" \
  -o "$CONTENTS_DIR/MacOS/KakaoInbox"

cp "$PROJECT_DIR/macos/Info.plist" "$CONTENTS_DIR/Info.plist"

qlmanage -t -s 1024 -o "$ICON_SOURCE_DIR" "$PROJECT_DIR/public/icon.svg" >/dev/null
ICON_PNG="$ICON_SOURCE_DIR/icon.svg.png"

for spec in "16:icon_16x16.png" "32:icon_16x16@2x.png" "32:icon_32x32.png" "64:icon_32x32@2x.png" "128:icon_128x128.png" "256:icon_128x128@2x.png" "256:icon_256x256.png" "512:icon_256x256@2x.png" "512:icon_512x512.png" "1024:icon_512x512@2x.png"; do
  size="${spec%%:*}"
  name="${spec#*:}"
  sips -z "$size" "$size" "$ICON_PNG" --out "$ICONSET_DIR/$name" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o "$CONTENTS_DIR/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP_DIR"

echo "$APP_DIR"
