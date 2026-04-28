// 텔레그램 봇 푸시 알림 전송
// BotFather에서 봇 생성 → token 발급 → 봇과 1:1 대화 시작 → /api/telegram/init 등으로 chat_id 확인
// settings: telegram_bot_token, telegram_chat_id, telegram_enabled

import { getSetting } from "./store";

const API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

interface PushOptions {
  title?: string;
  message: string;
  // 클릭 시 열릴 URL (inline keyboard 버튼으로 부착)
  click?: string;
  // 우선순위: ntfy 호환용. 텔레그램은 disable_notification 토글로 매핑
  priority?: "low" | "default" | "high" | "urgent";
  // 호환용. 텔레그램은 사용 안 함
  tags?: string[];
}

interface TelegramReplyMarkup {
  inline_keyboard: { text: string; url: string }[][];
}

interface TelegramPayload {
  chat_id: string;
  text: string;
  parse_mode: "HTML";
  disable_notification?: boolean;
  reply_markup?: TelegramReplyMarkup;
}

export async function sendPush(opts: PushOptions): Promise<boolean> {
  const enabled = getSetting("telegram_enabled");
  if (enabled !== "1") return false;

  const token = getSetting("telegram_bot_token");
  const chatId = getSetting("telegram_chat_id");
  if (!token || !chatId) return false;

  const text = opts.title
    ? `<b>${escapeHtml(opts.title)}</b>\n${escapeHtml(opts.message)}`
    : escapeHtml(opts.message);

  const payload: TelegramPayload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_notification: opts.priority === "low",
  };

  if (opts.click) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "인박스 열기", url: opts.click }]],
    };
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("telegram 전송 실패:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("telegram 에러:", err);
    return false;
  }
}

// HTML parse_mode에서 안전한 텍스트로 이스케이프
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 봇 토큰으로 최근 업데이트 조회 → 첫 chat_id 추출 (셋업 헬퍼)
// 사용자가 BotFather에서 봇 만들고 봇과 /start 한 뒤 호출
export async function fetchChatIdFromUpdates(token: string): Promise<{
  ok: boolean;
  chatId?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/bot${token}/getUpdates`);
    if (!res.ok) {
      return { ok: false, error: `getUpdates ${res.status}` };
    }
    const data = (await res.json()) as {
      ok: boolean;
      result: { message?: { chat?: { id: number } } }[];
    };
    if (!data.ok) return { ok: false, error: "API 응답 ok=false" };
    for (let i = data.result.length - 1; i >= 0; i--) {
      const id = data.result[i]?.message?.chat?.id;
      if (id) return { ok: true, chatId: String(id) };
    }
    return { ok: false, error: "업데이트 없음 — 봇과 /start 보낸 뒤 재시도" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
