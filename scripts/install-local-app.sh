#!/bin/zsh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_SOURCE="$PROJECT_DIR/dist/macos/Kakao Inbox.app"
APP_TARGET="$HOME/Applications/Kakao Inbox.app"
LAUNCH_AGENT_SOURCE="$PROJECT_DIR/macos/com.kakao-gui.plist.template"
LAUNCH_AGENT_TARGET="$HOME/Library/LaunchAgents/com.kakao-gui.plist"
LABEL="com.kakao-gui"
DOMAIN="gui/$(id -u)"
SERVICE_WAS_LOADED=false

restore_service_on_error() {
  if [ "$SERVICE_WAS_LOADED" = true ] && ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    launchctl bootstrap "$DOMAIN" "$LAUNCH_AGENT_TARGET"
  fi
}

trap restore_service_on_error ERR

cd "$PROJECT_DIR"

if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  SERVICE_WAS_LOADED=true
  launchctl bootout "$DOMAIN/$LABEL"
fi

pnpm build
"$PROJECT_DIR/scripts/build-macos-app.sh"

if pgrep -x KakaoInbox >/dev/null; then
  pkill -TERM -x KakaoInbox
  for _ in $(seq 1 20); do
    pgrep -x KakaoInbox >/dev/null || break
    sleep 0.25
  done
fi

mkdir -p "$HOME/Applications" "$HOME/Library/LaunchAgents" "$HOME/.kakaocli"
rm -rf "$APP_TARGET"
ditto "$APP_SOURCE" "$APP_TARGET"

escaped_project="${PROJECT_DIR//\//\\/}"
escaped_home="${HOME//\//\\/}"
sed -e "s/__PROJECT_DIR__/$escaped_project/g" -e "s/__HOME__/$escaped_home/g" "$LAUNCH_AGENT_SOURCE" > "$LAUNCH_AGENT_TARGET"
plutil -lint "$LAUNCH_AGENT_TARGET"

launchctl bootstrap "$DOMAIN" "$LAUNCH_AGENT_TARGET"
launchctl kickstart -k "$DOMAIN/$LABEL"
trap - ERR

for _ in $(seq 1 45); do
  if curl -fsS -o /dev/null http://localhost:3032; then
    open "$APP_TARGET"
    echo "설치 완료: $APP_TARGET"
    exit 0
  fi
  sleep 1
done

echo "로컬 서버가 45초 안에 시작되지 않았습니다." >&2
exit 1
