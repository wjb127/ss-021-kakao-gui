// AppleScript 기반 카카오톡 자동 발송
// 전제: 사용자가 카톡 mac 앱에서 대상 채팅방을 미리 열고 입력란 포커스 상태
// 동작: 클립보드 set → 카톡 활성화 → cmd+v → return

import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface SendResult {
  ok: boolean;
  error?: string;
}

// pbcopy로 클립보드 세팅 (큰 텍스트도 안전)
function setClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pbcopy");
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pbcopy exit ${code}`));
    });
    child.stdin.write(text, "utf-8");
    child.stdin.end();
  });
}

const APPLESCRIPT = `
tell application "KakaoTalk" to activate
delay 0.4
tell application "System Events"
  keystroke "v" using {command down}
  delay 0.15
  key code 36
end tell
`;

export async function sendKakaoMessage(text: string): Promise<SendResult> {
  if (!text.trim()) return { ok: false, error: "빈 메시지" };

  try {
    await setClipboard(text);
  } catch (e) {
    return { ok: false, error: `클립보드 실패: ${String(e)}` };
  }

  try {
    await execAsync(`osascript -e ${JSON.stringify(APPLESCRIPT)}`, {
      timeout: 10_000,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `AppleScript 실패: ${msg}` };
  }
}
