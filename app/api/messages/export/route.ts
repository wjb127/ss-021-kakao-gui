import { NextResponse, type NextRequest } from "next/server";
import { getCachedMessages } from "@/lib/store";
import { normalizeKakaoEvents } from "@/lib/kakao-events";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  const scope = req.nextUrl.searchParams.get("scope");
  if (!chatId || (scope !== "all" && scope !== "recent")) {
    return NextResponse.json({ error: "채팅방과 복사 범위를 확인해 주세요." }, { status: 400 });
  }
  const since = scope === "recent"
    ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  const messages = normalizeKakaoEvents(getCachedMessages(chatId, since));
  return NextResponse.json({ messages, since }, { headers: { "Cache-Control": "no-store" } });
}
