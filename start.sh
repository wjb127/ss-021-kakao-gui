#!/bin/zsh
# launchd 자동 실행 스크립트 - .env.local 로드 후 next start

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# .env.local 줄별 파싱 (공백 포함 값 처리)
if [ -f "$PROJECT_DIR/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # 빈 줄 / 주석 스킵
    [[ -z "$line" || "$line" == \#* ]] && continue
    # KEY=VALUE 형태만 처리
    if [[ "$line" == *=* ]]; then
      key="${line%%=*}"
      val="${line#*=}"
      export "$key=$val"
    fi
  done < "$PROJECT_DIR/.env.local"
fi

# nvm + homebrew pnpm 경로 포함
export PATH="/Users/seungbeenwi/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

exec pnpm start
