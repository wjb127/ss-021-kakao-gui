#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
app="$HOME/Applications/Inbox Desk.app"
contents="$app/Contents"
mkdir -p "$contents/MacOS" "$contents/Resources"
xcrun swiftc -O -parse-as-library -target arm64-apple-macos13.0 macos/desk/*.swift -o "$contents/MacOS/InboxDesk"
cp macos/Info.plist "$contents/Info.plist"
for key in CFBundleName CFBundleDisplayName; do plutil -replace "$key" -string "Inbox Desk" "$contents/Info.plist"; done
plutil -replace CFBundleExecutable -string InboxDesk "$contents/Info.plist"
plutil -replace CFBundleIdentifier -string com.seungbeen.inbox-desk "$contents/Info.plist"
icon="$HOME/Applications/Kakao Inbox.app/Contents/Resources/AppIcon.icns"
if [[ -f "$icon" ]]; then cp "$icon" "$contents/Resources/"; fi
codesign --force --sign - "$app"
codesign --verify "$app"
