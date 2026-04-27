// 특정 채팅의 메시지 조회 (10명 이하: SQLite 캐시 + kakaocli 동기화)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listMessages } from "@/lib/kakaocli";
import { getCachedMessages, upsertMessages } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json(
      { error: "chatId 쿼리 파라미터가 필요함" },
      { status: 400 },
    );
  }

  const memberCount = parseInt(
    req.nextUrl.searchParams.get("memberCount") || "0",
    10,
  );
  const shouldCache = memberCount > 0 && memberCount <= 10;

  if (shouldCache) {
    // kakaocli에서 최신 50일치 가져와서 SQLite에 upsert
    const fresh = await listMessages(chatId, "50d", 5000);
    upsertMessages(fresh);
    // SQLite에 누적된 전체 메시지 반환 (카카오 DB 불필요)
    const cached = getCachedMessages(chatId);
    return NextResponse.json(cached);
  }

  // 10명 초과: 캐시 없이 직접 조회
  const messages = await listMessages(chatId, "10d", 1000);
  return NextResponse.json(messages);
}
