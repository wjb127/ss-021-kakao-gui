import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getCachedMessages,
  upsertMessages,
  updateManualChatLastMessage,
} from "@/lib/store";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ParsedMessage {
  is_from_me: boolean;
  text: string;
  minutes_from_start: number;
}

const SYSTEM_PROMPT = `대화 텍스트를 파싱해서 JSON 배열로만 반환하세요. 설명 없이 JSON만.

각 항목 형식:
{ "is_from_me": boolean, "text": string, "minutes_from_start": number }

규칙:
- 판매자/나/Me/seller/공급자 → is_from_me: true
- 구매자/상대방/고객/buyer/의뢰인 → is_from_me: false
- 라벨이 없으면 대화 흐름으로 판단 (첫 메시지 발신자를 상대방으로 간주)
- minutes_from_start: 첫 메시지 = 0, 이후 순서대로 1씩 증가 (실제 시간 있으면 분 단위 파싱)
- 시스템 메시지/알림/광고 제외
- 빈 텍스트 제외`;

export async function POST(req: NextRequest) {
  const { chatId, rawText, isAppend } = (await req.json()) as {
    chatId?: string;
    rawText?: string;
    isAppend?: boolean;
  };

  if (!chatId || !rawText?.trim()) {
    return NextResponse.json({ error: "chatId, rawText required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  // Claude로 파싱
  let parsed: ParsedMessage[];
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `대화:\n"""\n${rawText.trim()}\n"""` }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as ParsedMessage[]) : [];
  } catch (e) {
    return NextResponse.json({ error: `파싱 실패: ${String(e)}` }, { status: 500 });
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: "파싱된 메시지 없음" }, { status: 400 });
  }

  // 타임스탬프 계산
  const maxMinutes = Math.max(...parsed.map((p) => p.minutes_from_start));

  let baseTime: number;
  if (isAppend) {
    const existing = getCachedMessages(chatId);
    const lastTs = existing.length > 0
      ? existing[existing.length - 1].timestamp
      : new Date().toISOString();
    baseTime = new Date(lastTs).getTime() + 60_000; // 1분 후부터 시작
  } else {
    // 대화가 방금 끝났다고 가정 — 역산
    baseTime = Date.now() - maxMinutes * 60_000;
  }

  // Message 객체 생성
  const messages: Message[] = parsed.map((p, i) => {
    const ts = new Date(baseTime + p.minutes_from_start * 60_000).toISOString();
    return {
      id: `manual_${chatId}_${Date.now()}_${i}`,
      chat_id: chatId,
      sender_id: p.is_from_me ? "me" : "other",
      text: p.text,
      is_from_me: p.is_from_me,
      timestamp: ts,
      type: "text",
    };
  });

  upsertMessages(messages);

  // manual chat인 경우 last_message_at 업데이트
  if (chatId.startsWith("manual_")) {
    const lastMsg = messages[messages.length - 1];
    updateManualChatLastMessage(chatId, lastMsg.timestamp);
  }

  return NextResponse.json({ count: messages.length, messages });
}
