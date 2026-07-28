#!/bin/zsh
# Local desktop/PWA server launcher.
# Default is dev mode so launchd does not require a fresh production build.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-dev}"
PORT="${PORT:-3032}"
LOG_DIR="${KAKAOGUI_LOG_DIR:-$HOME/.kakaocli}"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

# .env.local 줄별 파싱 (공백 포함 값 처리)
if [ -f "$PROJECT_DIR/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == *=* ]]; then
      key="${line%%=*}"
      val="${line#*=}"
      export "$key=$val"
    fi
  done < "$PROJECT_DIR/.env.local"
fi

# nvm + homebrew pnpm 경로 포함
export PATH="/Users/seungbeenwi/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] kakao-gui start-local mode=$MODE port=$PORT" >> "$LOG_DIR/kakao-gui-launch.log"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] pnpm not found in PATH=$PATH" >> "$LOG_DIR/kakao-gui-launch.log"
  exit 1
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules missing; running pnpm install --frozen-lockfile" >> "$LOG_DIR/kakao-gui-launch.log"
  pnpm install --frozen-lockfile
fi

# launchd 재시작/수동 재실행 때 남은 dev/start 서버를 정리한다.
if command -v lsof >/dev/null 2>&1; then
  lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
fi

case "$MODE" in
  dev)
    exec pnpm exec next dev -p "$PORT"
    ;;
  prod|start)
    if [ ! -d "$PROJECT_DIR/.next" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] .next missing; run pnpm build first" >> "$LOG_DIR/kakao-gui-launch.log"
      exit 1
    fi
    exec pnpm exec next start -p "$PORT"
    ;;
  *)
    echo "Usage: $0 [dev|prod]" >&2
    exit 2
    ;;
esac
