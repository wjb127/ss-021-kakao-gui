#!/bin/zsh

set -euo pipefail

LABEL="com.kakao-gui"
DOMAIN="gui/$(id -u)"
APP_PATH="$HOME/Applications/Kakao Inbox.app"

launchctl kickstart -k "$DOMAIN/$LABEL"

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://localhost:3032; then
    open "$APP_PATH"
    echo "카카오 인박스를 다시 실행했습니다."
    exit 0
  fi
  sleep 1
done

echo "로컬 서버가 30초 안에 시작되지 않았습니다." >&2
exit 1
