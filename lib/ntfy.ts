// ntfy.sh 푸시 알림 전송
// 토픽 URL: https://ntfy.sh/<topic>
// 모바일 ntfy 앱에서 같은 토픽 구독하면 푸시 받음

import { getSetting } from "./store";

export const NTFY_BASE = process.env.NTFY_SERVER || "https://ntfy.sh";

interface PushOptions {
  title?: string;
  message: string;
  // 클릭 시 열릴 URL (모바일 PWA 딥링크용)
  click?: string;
  // low | default | high | urgent
  priority?: "low" | "default" | "high" | "urgent";
  tags?: string[];
}

export async function sendPush(opts: PushOptions): Promise<boolean> {
  const enabled = getSetting("ntfy_enabled");
  if (enabled !== "1") return false;

  const topic = getSetting("ntfy_topic");
  if (!topic) return false;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
    };
    if (opts.title) headers["Title"] = encodeRFC2047(opts.title);
    if (opts.click) headers["Click"] = opts.click;
    if (opts.priority) headers["Priority"] = opts.priority;
    if (opts.tags?.length) headers["Tags"] = opts.tags.join(",");

    const res = await fetch(`${NTFY_BASE}/${topic}`, {
      method: "POST",
      headers,
      body: opts.message,
    });
    if (!res.ok) {
      console.error("ntfy 전송 실패:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("ntfy 에러:", err);
    return false;
  }
}

// ntfy 헤더는 ASCII만 받음. 한글은 RFC2047 인코딩
function encodeRFC2047(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}

// 토픽 자동 생성 (랜덤 32자)
export function generateTopic(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `kakao-inbox-${ts}-${rand}`;
}
