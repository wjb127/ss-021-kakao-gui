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
