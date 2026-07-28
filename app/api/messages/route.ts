// 특정 채팅의 메시지 조회 (10명 이하: SQLite 캐시 + kakaocli 동기화)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listMessages } from "@/lib/kakaocli";
import { normalizeKakaoEvents } from "@/lib/kakao-events";
import {
  deleteMessagesByIds,
  getCachedMessages,
  upsertMessages,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json(
      { error: "chatId 쿼리 파라미터가 필요함" },
      { status: 400 },
    );
  }

  // manual chat은 kakaocli 호출 없이 캐시만 반환
  if (chatId.startsWith("manual_")) {
    return NextResponse.json(getCachedMessages(chatId));
  }

  const memberCount = parseInt(
    req.nextUrl.searchParams.get("memberCount") || "0",
    10,
  );
  const shouldCache = memberCount > 0 && memberCount <= 10;

  if (shouldCache) {
    // kakaocli에서 최신 50일치 가져와서 SQLite에 upsert
    const fresh = await listMessages(chatId, "50d", 5000);
    deleteMessagesByIds(
      fresh
        .map((message) => message.deleted_message_id)
        .filter((id): id is string => !!id),
    );
    upsertMessages(fresh);
    // SQLite에 누적된 전체 메시지 반환 (카카오 DB 불필요)
    const cached = getCachedMessages(chatId);
    const freshById = new Map(fresh.map((m) => [m.id, m]));
    const senderNames = new Map(
      fresh
        .filter((m) => m.sender_name)
        .map((m) => [m.sender_id, m.sender_name as string]),
    );
    return NextResponse.json(
      normalizeKakaoEvents(cached).map((m) => {
        const f = freshById.get(m.id);
        return {
          ...m,
          sender_name: f?.sender_name ?? senderNames.get(m.sender_id),
          localFilePath: f?.localFilePath,
          attachment: f?.attachment,
          reply: f?.reply ?? m.reply,
          is_edited: f?.is_edited ?? m.is_edited,
        };
      }),
    );
  }

  // 10명 초과: 캐시 없이 직접 조회
  const messages = await listMessages(chatId, "10d", 1000);
  return NextResponse.json(messages);
}
