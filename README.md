# Kakao Inbox

카카오톡 로컬 데이터를 읽어 고객 대화와 첨부파일을 관리하는 macOS 인박스다.

## macOS 앱 설치

크롬과 독립된 `WKWebView` 앱과 production 서버를 함께 설치한다.

```bash
pnpm local:install
```

설치 후 앱은 `~/Applications/Kakao Inbox.app`에 생성된다. 앱을 열면 로컬 서버 상태를 확인하고, 서버가 꺼져 있으면 launchd 서비스를 복구한 뒤 인박스를 연다.

코드를 수정한 뒤에는 `pnpm local:install`을 다시 실행해 production 빌드를 갱신한다. 단순 재실행은 다음 명령을 사용한다.

```bash
pnpm local:restart
```

개발 서버는 다음 명령으로 실행한다.

```bash
pnpm dev
```

설치된 앱 서버는 `http://localhost:3032`, 개발 서버는 `http://localhost:3033`을 사용한다.

## 대화 로딩

목록은 SQLite에 저장한 최근 목록부터 표시하고 원본 목록을 백그라운드에서 갱신한다.
캐시 가능한 소규모 채팅방(10명 이하)은 저장된 최신 300건을 먼저 표시한 뒤 최근 3일을 동기화한다.
처음 여는 방은 최신 응답 이후 기존 범위인 최대 50일·5,000건을 한 방씩 보충한다.
이미 저장된 과거 대화는 삭제하지 않으며, 위쪽 600px 이내로 스크롤하면 300건씩 추가 조회한다.
과거 페이지는 카카오 원본 조회 없이 SQLite 커서로 읽고 읽던 위치를 유지한다.

로딩 경로 회귀 검증: `node --experimental-strip-types scripts/test-inbox-loading.ts`
