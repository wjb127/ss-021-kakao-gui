#!/bin/zsh
# 카카오 인박스 로컬 서버 실행기

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-prod}"
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

# launchd 로그가 계속 커지지 않도록 큰 로그만 이전 파일로 교체한다.
for log_file in "$LOG_DIR/kakao-gui.log" "$LOG_DIR/kakao-gui-error.log"; do
  if [ -f "$log_file" ] && [ "$(stat -f %z "$log_file")" -gt 10485760 ]; then
    mv "$log_file" "$log_file.previous"
  fi
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] pnpm not found in PATH=$PATH" >> "$LOG_DIR/kakao-gui-launch.log"
  exit 1
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] node_modules missing; running pnpm install --frozen-lockfile" >> "$LOG_DIR/kakao-gui-launch.log"
  pnpm install --frozen-lockfile
fi

# 다른 프로세스를 임의로 종료하지 않고 포트 충돌을 명시적으로 기록한다.
if command -v lsof >/dev/null 2>&1; then
  if port_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN)"; then
    port_pid="${port_pids%%$'\n'*}"
    if [ -n "$port_pid" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] port $PORT already in use by pid=$port_pid" >> "$LOG_DIR/kakao-gui-launch.log"
      exit 1
    fi
  fi
fi

case "$MODE" in
  dev)
    exec pnpm exec next dev -p "$PORT"
    ;;
  prod|start)
    if [ ! -f "$PROJECT_DIR/.next/BUILD_ID" ]; then
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
