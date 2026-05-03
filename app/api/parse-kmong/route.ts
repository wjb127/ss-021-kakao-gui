// 크몽 채팅 텍스트 룰 파싱 → manual 채팅 메시지 추가
import { NextRequest, NextResponse } from "next/server";
import { parseKmong } from "@/lib/kmong-parser";
import {
  getCachedMessages,
  upsertMessages,
  updateManualChatLastMessage,
  deleteMessagesForChat,
} from "@/lib/store";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Mode = "replace" | "append";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    chatId?: string;
    rawText?: string;
    mode?: Mode;
    isAppend?: boolean; // 하위호환
  };
  const { chatId, rawText } = body;
  // mode 우선, 없으면 isAppend 호환 (기본 append)
  const mode: Mode = body.mode ?? (body.isAppend === false ? "replace" : "append");

  if (!chatId || !rawText?.trim()) {
    return NextResponse.json({ error: "chatId, rawText required" }, { status: 400 });
  }

  const parsed = parseKmong(rawText);
  if (parsed.length === 0) {
    return NextResponse.json({ error: "파싱된 메시지 없음" }, { status: 400 });
  }

  // replace 모드: 기존 메시지 전부 삭제 후 새로 입력
  // append 모드: 기존 마지막 메시지 이후 timestamp 만 채택 (중복/과거 데이터 차단)
  let filtered = parsed;
  if (mode === "replace") {
    deleteMessagesForChat(chatId);
  } else {
    const existing = getCachedMessages(chatId);
    if (existing.length > 0) {
      const lastTs = existing[existing.length - 1].timestamp;
      filtered = parsed.filter((p) => p.timestamp > lastTs);
    }
  }

  if (filtered.length === 0) {
    return NextResponse.json({ count: 0, messages: [], skipped: parsed.length });
  }

  const now = Date.now();
  const messages: Message[] = filtered.map((p, i) => ({
    id: `kmong_${chatId}_${now}_${i}`,
    chat_id: chatId,
    sender_id: p.is_from_me ? "me" : "other",
    text: p.text,
    is_from_me: p.is_from_me,
    timestamp: p.timestamp,
    type: p.type,
  }));

  upsertMessages(messages);

  if (chatId.startsWith("manual_")) {
    const last = messages[messages.length - 1];
    updateManualChatLastMessage(chatId, last.timestamp);
  }

  return NextResponse.json({
    count: messages.length,
    skipped: parsed.length - filtered.length,
    messages,
  });
}
