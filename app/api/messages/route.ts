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
  const memberCount = parseInt(req.nextUrl.searchParams.get("memberCount") || "0", 10);
  const since = memberCount > 0 && memberCount <= 10 ? "50d" : "10d";
  const messages = await listMessages(chatId, since, 2000);
  return NextResponse.json(messages);
}
