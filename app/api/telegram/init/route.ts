// 텔레그램 봇 chat_id 자동 감지 헬퍼
// 사용자: BotFather에서 봇 생성 → 토큰 저장 → 봇과 /start 보냄 → 이 라우트 호출
// 가장 최근 업데이트의 chat.id를 telegram_chat_id로 저장

import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/store";
import { fetchChatIdFromUpdates } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = getSetting("telegram_bot_token");
  if (!token) {
    return NextResponse.json(
      { error: "telegram_bot_token 먼저 저장 필요" },
      { status: 400 },
    );
  }

  const result = await fetchChatIdFromUpdates(token);
  if (!result.ok || !result.chatId) {
    return NextResponse.json(
      { error: result.error || "chat_id 감지 실패" },
      { status: 400 },
    );
  }

  setSetting("telegram_chat_id", result.chatId);
  return NextResponse.json({ ok: true, chatId: result.chatId });
}
