#!/bin/zsh
# launchd 자동 실행 스크립트 - 설치 시 생성한 프로덕션 빌드를 실행한다.

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec /bin/zsh "$PROJECT_DIR/start-local.sh" prod
