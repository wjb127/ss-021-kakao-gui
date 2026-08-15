// 카카오톡 자동 발송 (프로젝트 전용 macOS 접근성 헬퍼)
// 안전장치:
//  - settings.send_enabled === "1" 필수
//  - body.confirmed === true 필수 (UI에서 사용자 확인 후만 호출)
//  - chatId로 실제 채팅방을 다시 확인한 뒤 발송

import { after, NextRequest, NextResponse } from "next/server";
import {
  getSetting,
  replaceCachedMessage,
  upsertMessages,
} from "@/lib/store";
import { sendKakaoMessage } from "@/lib/kakao-sender";
import { listChats, listMessages } from "@/lib/kakaocli";
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
  if (chatId.startsWith("manual_")) {
    return NextResponse.json(
      { error: "외부에서 복원한 채팅은 카카오톡으로 발송할 수 없음" },
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

  // 발송 대상은 오래된(비활성) 방일 수 있어 목록 기본값(200)으로는 못 찾는다.
  // kakaocli는 1000건 조회도 0.1초대라 깊게 찾는다.
  const chats = await listChats(1000);
  const targetChat = chats.find((chat) => chat.id === chatId);
  if (!targetChat) {
    return NextResponse.json(
      { error: "선택한 카카오톡 채팅방을 찾을 수 없음" },
      { status: 404 },
    );
  }

  const isSelfChat = targetChat.member_count === 1;
  const result = await sendKakaoMessage(text, {
    chatName: targetChat.display_name,
    isSelf: isSelfChat,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // 화면에는 즉시 반영하고 실제 카카오 메시지 ID 동기화는 응답 이후 처리한다.
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

  after(async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const recent = await listMessages(chatId, "1d", 100);
      const sentAt = new Date(now).getTime();
      const actualMessage = recent
        .filter((message) =>
          message.is_from_me && message.text.trim() === text.trim()
        )
        .map((message) => ({
          message,
          distance: Math.abs(new Date(message.timestamp).getTime() - sentAt),
        }))
        .filter(({ distance }) => distance < 60_000)
        .sort((a, b) => a.distance - b.distance)[0]?.message;
      if (actualMessage) replaceCachedMessage(msg.id, actualMessage);
    } catch (error) {
      console.error("발송 메시지 ID 동기화 실패:", error);
    }
  });

  return NextResponse.json({
    ok: true,
    message: msg,
    target: isSelfChat ? "나와의 채팅" : targetChat.display_name,
  });
}
