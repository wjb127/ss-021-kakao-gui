// macOS 접근성 API 기반 카카오톡 발송
// 채팅방 이름을 직접 찾아 열며, 1인 채팅은 badge me로 나와의 채팅을 지정한다.

import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SEND_HELPER = process.env.KAKAO_SEND_HELPER_BIN
  || path.join(os.homedir(), ".kakaocli", "bin", "kakao-send");

interface SendTarget {
  chatName: string;
  isSelf: boolean;
}

interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendKakaoMessage(
  text: string,
  target: SendTarget,
): Promise<SendResult> {
  const message = text.trim();
  if (!message) return { ok: false, error: "빈 메시지" };
  if (!target.isSelf && !target.chatName.trim()) {
    return { ok: false, error: "채팅방 이름을 확인할 수 없음" };
  }

  const args = target.isSelf
    ? ["--me", "_", message]
    : [target.chatName.trim(), message];

  try {
    await execFileAsync(SEND_HELPER, args, {
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true };
  } catch (error) {
    const failure = error as Error & {
      code?: string | number;
      signal?: string;
      stderr?: string;
      stdout?: string;
    };
    const detail = [
      failure.stderr?.trim(),
      failure.stdout?.trim(),
      failure.message,
      failure.code != null ? `종료 코드: ${failure.code}` : "",
      failure.signal ? `종료 신호: ${failure.signal}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      ok: false,
      error: `카카오톡 발송 실패: ${detail.slice(0, 1200)}`,
    };
  }
}
