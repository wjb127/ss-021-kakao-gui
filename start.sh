#!/bin/zsh
# launchd 자동 실행 스크립트 - 기본은 빌드가 필요 없는 dev 서버

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec /bin/zsh "$PROJECT_DIR/start-local.sh" dev
