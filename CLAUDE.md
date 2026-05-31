# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16.2.4** — APIs/규칙이 학습 데이터와 다를 수 있음. 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽을 것 (위 AGENTS.md).

## 이 프로젝트가 뭔지

1인 개발자/프리랜서용 **로컬 카카오톡 인박스 CS 관리 GUI**. macOS 카카오톡 앱의 암호화 로컬 DB를 읽어서 웹으로 띄우고, AI로 문의 분석·답변 초안·자동발송·텔레그램 알림·Claude Code 원격 실행까지 붙인 개인 운영 대시보드. 외주(크몽) 문의를 프로젝트별로 매핑해서 처리하는 게 핵심 용도. 배포 안 하는 로컬 전용 앱 (`start.sh`로 launchd 자동 실행).

## 명령어

- `pnpm dev` — 개발 서버 (포트 **3032**, 시작 시 해당 포트 자동 kill)
- `pnpm build` — 프로덕션 빌드. **작업 완료 판단 기준** (TS 에러 0 + 빌드 성공)
- `pnpm start` — 프로덕션 서버 (포트 3032)
- `pnpm lint` — ESLint
- 패키지 매니저는 **pnpm 전용** (npm 금지). `better-sqlite3`는 `onlyBuiltDependencies`에 등록됨
- 테스트 스위트 없음. 동작 검증은 직접 curl 또는 브라우저로

## 두 개의 SQLite DB — 절대 혼동 금지

이 앱은 **서로 다른 두 DB**를 다룬다:

1. **카카오톡 원본 DB** (읽기 전용, 암호화/SQLCipher) — `KAKAOCLI_DB` 경로. 절대 직접 열거나 쓰지 않음. 외부 바이너리 `kakaocli`(`KAKAOCLI_BIN`)를 `execFile`로 호출해 복호화·조회 (`lib/kakaocli.ts`). 키는 `KAKAOCLI_KEY`.
2. **앱 자체 DB** (`~/.kakaocli/kakao-gui.db`, better-sqlite3, repo 밖) — 스키마는 `lib/db.ts`, 모든 접근은 `lib/store.ts` 경유. 카테고리/AI분석/메시지캐시/manual_chats/메모/project_paths/last_seen/app_settings/claude_runs/downloads 저장.

`store.ts`가 곧 데이터 레이어다. 새 영속 데이터가 필요하면 `db.ts`에 `CREATE TABLE IF NOT EXISTS` 추가 + `store.ts`에 접근 함수 추가하는 패턴.

## 아키텍처 핵심

**Edge 런타임 금지.** `better-sqlite3` + `kakaocli`는 nodejs 런타임에서만 동작. API 라우트는 `export const dynamic = "force-dynamic"` 쓰고, `next.config.ts`의 `serverExternalPackages: ["better-sqlite3"]` 유지. `instrumentation.ts`도 `NEXT_RUNTIME !== "nodejs"`면 early return.

**메시지 해석 패턴 (라우트마다 반복됨).** `chatId`가 `manual_`로 시작 → 카카오 DB에 없는 외부(크몽 등) 수동 채팅 → 앱 SQLite 캐시(`getCachedMessages`)만 사용. 그 외 → `kakaocli`로 조회. 캐싱은 `member_count`가 **1~10인 채팅만** (1:1/소규모 DM). `messages`/`analyze`/`draft-reply` 라우트 모두 이 분기를 가짐.

**ID는 항상 문자열.** 카카오 ID는 16자리+ 큰 정수라 JS Number(53bit) 정밀도 손실 위험. `kakaocli.ts`의 `parseSafeJson`이 `id/chat_id/sender_id` 큰 정수를 regex로 string 래핑한 뒤 파싱. 코드 전반에서 ID를 string으로 다룰 것.

**백그라운드 폴링 워커** (`lib/worker.ts`, `instrumentation.ts`에서 부팅 시 1회 시작). 기본 30초(설정 `poll_interval_sec`, 30~600s)마다 최근 활동 상위 10개 채팅 검사 → 새 메시지 감지 → `category === "client"`인 채팅만 텔레그램 푸시. `worker_enabled === "1"`일 때만 동작. HMR 중복 실행은 `globalThis` 플래그로 방지. 첫 폴링은 알림 없이 baseline(`last_seen`)만 기록.

**AI 이원화.**
- 문의 분석 (`/api/analyze`): **OpenAI** (`OPENAI_MODEL`, 기본 `gpt-4.1`), JSON 모드로 summary/urgency/todos/nextAction → `analyses` 테이블 저장.
- 답변 초안 (`/api/draft-reply`): **Anthropic** (`claude-opus-4-5`), 톤(formal/casual/brief) + 고객 메모 컨텍스트로 카톡 답변 1건 생성.

**카톡 자동발송** (`lib/kakao-sender.ts`, `/api/send-message`). AppleScript + 클립보드(pbcopy) 방식 — 카톡 mac 앱이 **frontmost이고 입력란 포커스**된 상태여야 함 (강제 activate 안 함). 이중 안전장치: 설정 `send_enabled === "1"` + 요청 `confirmed === true` 둘 다 필요. 발송 성공 시 보낸 메시지를 캐시에 own 메시지로 누적.

**Claude Code 원격 실행** (`/api/claude-trigger` → `lib/claude-runner.ts`). 채팅에 매핑된 프로젝트 경로(`project_paths`)에 `KAKAO_CONTEXT.md`(대화+메모+분석, `lib/context-export.ts`)를 써넣고 → 그 cwd에서 `claude -p <prompt>` 백그라운드 spawn → stdout/stderr를 `claude_runs` 테이블에 실시간 누적. 10분 hard timeout. `claude_skip_permissions` 설정 시 `--dangerously-skip-permissions` 추가. 바이너리는 `CLAUDE_BIN`(기본 `claude`).

**크몽 등 외부 채팅 복원.** `lib/kmong-parser.ts`가 붙여넣은 크몽 채팅 텍스트(날짜/시간 마커·avatar·썸네일 패턴)를 룰 기반으로 `Message[]`로 파싱. `/api/manual-chat`로 manual 채팅 생성, `/api/restore-messages`로 메시지 주입. 의존성 없어서 서버/클라 양쪽 사용 가능(옵티미스틱 UI).

**프론트엔드.** `app/page.tsx` 단일 클라이언트 컴포넌트가 3개 뷰(`inbox`/`board`/`card`) 전환. 인박스는 모바일=단일 패널 전환, 데스크톱(md+)=3패널(ChatList/ChatView/AIPanel). 모바일 퍼스트. 텔레그램 푸시 클릭 딥링크는 `/?chat=<id>`로 들어옴.

## 설정 / 환경변수

런타임 토글은 코드가 아니라 **`app_settings` 테이블**(설정 UI → `/api/settings`)에 있음. 허용 키: `telegram_bot_token`, `telegram_chat_id`, `telegram_enabled`, `worker_enabled`, `app_url`, `claude_skip_permissions`, `send_enabled`, `poll_interval_sec`.

`.env.local` (repo 밖 비밀): `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `KAKAOCLI_BIN`, `KAKAOCLI_DB`, `KAKAOCLI_KEY`, `CS_OUTPUT_DIR`. 선택: `CLAUDE_BIN`, `TELEGRAM_API_BASE`.

## 주의사항

- 이 앱은 호스트 머신의 **실제 카카오톡 데이터를 읽고 실제 메시지를 발송**한다. 발송/Claude 실행은 비가역 — 안전장치(`send_enabled`/`confirmed`, frontmost 검증) 우회 금지.
- `KAKAO_CONTEXT.md`는 외부 프로젝트로 export되는 산출물 — 이 repo 안에 생기면 안 됨 (`.gitignore`로 차단). `cs-inbox/`도 민감 산출물이라 gitignore됨.
- `allowedDevOrigins`에 Tailscale/LAN/mDNS 주소가 등록돼 있음(폰에서 접속용). 새 디바이스 접속 안 되면 여기 추가.
- 텔레그램은 과거 ntfy에서 마이그레이션됨. `lib/telegram.ts`의 `PushOptions`가 아직 ntfy 호환 필드(`priority`/`tags`)를 받지만 텔레그램은 `priority: "low"`만 무음 처리에 씀.
