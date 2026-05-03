// 크몽 채팅 텍스트 → Message[] 룰 기반 파서
// 의존성 없음 (서버/클라 양쪽 사용 가능, 옵티미스틱 UI 위해)
//
// 포맷 패턴:
//   - 메시지 블록 끝에 `YY.MM.DD\nHH:MM` 2줄 = 시간 마커 (KST)
//   - 블록 위에 `avatar` 단독 라인 → 상대(고객) 메시지, 없으면 나(판매자)
//   - `파일 썸네일 이미지\n<filename>\n<EXT>` 3줄 = 사진 첨부
//   - `※ 주의...` / `* 주의...` / `[신고하기]` = 시스템 노이즈 (제외)
//   - `문의 서비스`, `크몽 안전 결제`, `결제한 서비스` 블록 = 헤더/시스템 (제외)
//   - `삭제된 메시지입니다.`, `취소된 결제요청입니다.` = 시스템 메시지로 보존

export interface ParsedKmongMessage {
  is_from_me: boolean;
  text: string;
  type: "text" | "photo" | "system";
  timestamp: string; // ISO
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

function toIsoKst(yy: string, mm: string, dd: string, hh: string, min: string): string {
  // KST(UTC+9) → ISO. 2자리 YY는 2000년대로 가정
  return new Date(
    `20${yy}-${mm}-${dd}T${hh}:${min}:00+09:00`,
  ).toISOString();
}

function isWarningLine(line: string): boolean {
  const t = line.trim();
  // ※ 주의 / * 주의 / 신고하기 / 안전 결제 정책 안내
  if (/^[※*]\s*주의/.test(t)) return true;
  if (/\[신고하기\]\s*$/.test(t)) return true;
  return false;
}

function flushBlock(
  buffer: string[],
  hasAvatar: boolean,
  timestamp: string,
  out: ParsedKmongMessage[],
): void {
  // 앞뒤 빈 줄 제거
  while (buffer.length && !buffer[0].trim()) buffer.shift();
  while (buffer.length && !buffer[buffer.length - 1].trim()) buffer.pop();
  if (buffer.length === 0) return;

  const isFromMe = !hasAvatar;
  const joined = buffer.join("\n");

  // 시스템 블록 (스킵)
  if (/^문의 서비스\s*\n/.test(joined)) return;
  if (/^크몽\s*안전\s*결제/.test(joined)) return;
  if (/^결제한 서비스/.test(joined)) {
    // 결제 완료 알림은 시스템 메시지로 보존
    const amt = joined.match(/([\d,]+\s*원)\s*결제했습니다/);
    out.push({
      is_from_me: false,
      text: amt ? `[결제완료: ${amt[1]}]` : "[결제완료]",
      type: "system",
      timestamp,
    });
    return;
  }

  // 사진 첨부 추출 + 시스템 라인 제거
  const textLines: string[] = [];
  let i = 0;
  while (i < buffer.length) {
    const ln = buffer[i];
    // 파일 썸네일 이미지 패턴 (3줄)
    if (
      ln.trim() === "파일 썸네일 이미지" &&
      i + 2 < buffer.length &&
      /^[A-Za-z]{2,5}$/.test(buffer[i + 2].trim())
    ) {
      const filename = buffer[i + 1].trim();
      out.push({
        is_from_me: isFromMe,
        text: `[사진: ${filename}]`,
        type: "photo",
        timestamp,
      });
      i += 3;
      continue;
    }
    if (isWarningLine(ln)) {
      i++;
      continue;
    }
    textLines.push(ln);
    i++;
  }

  let text = textLines.join("\n").trim();
  if (!text) return;

  // 단독 시스템 메시지
  if (text === "삭제된 메시지입니다." || text === "취소된 결제요청입니다.") {
    out.push({ is_from_me: isFromMe, text, type: "system", timestamp });
    return;
  }

  out.push({ is_from_me: isFromMe, text, type: "text", timestamp });
}

export function parseKmong(raw: string): ParsedKmongMessage[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: ParsedKmongMessage[] = [];
  let buffer: string[] = [];
  let pendingAvatar = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";

    // 시간 마커 (날짜+시간) 감지
    const dm = DATE_RE.exec(line.trim());
    const tm = next ? TIME_RE.exec(next.trim()) : null;
    if (dm && tm) {
      const ts = toIsoKst(dm[1], dm[2], dm[3], tm[1], tm[2]);
      flushBlock(buffer, pendingAvatar, ts, out);
      buffer = [];
      pendingAvatar = false;
      i++; // 시간 라인 스킵
      continue;
    }

    // 빈 줄: 블록 시작 전이면 무시, 진행 중이면 보존
    if (line.trim() === "" && buffer.length === 0) continue;

    // avatar 마커: 새 블록 시작 직전에만 인식
    if (line.trim() === "avatar" && buffer.length === 0) {
      pendingAvatar = true;
      continue;
    }

    buffer.push(line);
  }

  // 마지막 블록 (시간 마커 없으면 버려짐 — 의도적)
  return out;
}
