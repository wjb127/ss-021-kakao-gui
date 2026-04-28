// 카카오톡 자동 발송 (AppleScript)
// 안전장치:
//  - settings.send_enabled === "1" 필수
//  - body.confirmed === true 필수 (UI에서 사용자 확인 후만 호출)
//  - 발송 후 SQLite messages 캐시에 own 메시지로 추가 (manual_chat이면 last_message_at도 갱신)

import { NextRequest, NextResponse } from "next/server";
import {
  getSetting,
  upsertMessages,
  updateManualChatLastMessage,
} from "@/lib/store";
import { sendKakaoMessage } from "@/lib/kakao-sender";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  chatId?: string;
  text?: string;
  confirmed?: boolean;
}

export async function POST(req: NextRequest) {
  const { chatId, text, confirmed } = (await req.json()) as Body;

  if (!chatId || !text?.trim()) {
    return NextResponse.json(
      { error: "chatId, text 필수" },
      { status: 400 },
    );
  }
  if (!confirmed) {
    return NextResponse.json(
      { error: "confirmed=true 필요 (UI에서 사용자 확인 후 호출)" },
      { status: 400 },
    );
  }

  const enabled = getSetting("send_enabled");
  if (enabled !== "1") {
    return NextResponse.json(
      { error: "자동발송 비활성. 설정에서 활성화 필요" },
      { status: 403 },
    );
  }

  const result = await sendKakaoMessage(text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // 발송 성공 → 캐시 누적 (보낸 메시지로 기록)
  const now = new Date().toISOString();
  const msg: Message = {
    id: `sent_${chatId}_${Date.now()}`,
    chat_id: chatId,
    sender_id: "me",
    text,
    is_from_me: true,
    timestamp: now,
    type: "text",
  };
  upsertMessages([msg]);

  if (chatId.startsWith("manual_")) {
    updateManualChatLastMessage(chatId, now);
  }

  return NextResponse.json({ ok: true, message: msg });
}
