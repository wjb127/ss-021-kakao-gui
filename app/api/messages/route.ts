// 특정 채팅의 메시지 조회
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listMessages } from "@/lib/kakaocli";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json(
      { error: "chatId 쿼리 파라미터가 필요함" },
      { status: 400 },
    );
  }
  const messages = await listMessages(chatId, "10d", 1000);
  return NextResponse.json(messages);
}
