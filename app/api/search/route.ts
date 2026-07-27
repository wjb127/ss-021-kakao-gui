// 통합 검색 — 채팅방 이름 + 메시지 내용 + 메모 + 요청
// 대상은 앱 캐시 DB(~/.kakaocli/kakao-gui.db). 카카오 원본 전체가 아니라
// member_count 1~10 채팅만 캐싱되므로 대형 단톡방 내용은 포함되지 않는다.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const chatId = req.nextUrl.searchParams.get("chatId") || undefined;

  if (q.length < 2) {
    return NextResponse.json({
      query: q,
      error: q ? "2글자 이상 입력하세요" : null,
      messages: [],
      memos: [],
      requests: [],
    });
  }

  return NextResponse.json(searchAll(q, { chatId }));
}
