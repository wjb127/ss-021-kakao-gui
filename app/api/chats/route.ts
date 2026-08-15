// 채팅 목록 + 카테고리 병합 (kakaocli + manual)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listChats } from "@/lib/kakaocli";
import { getCategories, getManualChats } from "@/lib/store";

export const dynamic = "force-dynamic";

// UI 기본값. 늘리면 목록 렌더 비용이 커지므로 그대로 둔다.
const DEFAULT_LIMIT = 200;
// 특정 chatId를 찾을 때만 쓰는 깊은 조회 상한.
// kakaocli는 1000건도 0.1초대라 조회 비용이 사실상 없다.
const LOOKUP_LIMIT = 1000;

export async function GET(req: NextRequest) {
  // ?chatId= 가 오면 목록이 아니라 "그 방 하나 찾기"가 목적이므로 깊게 조회한다.
  // (오래된 방은 상위 200 밖으로 밀려나 매핑이 있어도 안 잡히는 문제)
  const wantedId = req.nextUrl.searchParams.get("chatId");
  // ?limit= 로 명시 요청 시 깊게 조회 (오래된 방 검색·매핑용). 상한은 LOOKUP_LIMIT.
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  const askedLimit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, LOOKUP_LIMIT)
    : null;
  const limit = wantedId ? LOOKUP_LIMIT : (askedLimit ?? DEFAULT_LIMIT);

  const [chats, categories, manualChats] = await Promise.all([
    listChats(limit),
    getCategories(),
    Promise.resolve(getManualChats()),
  ]);

  const merged = chats.map((c) => ({
    ...c,
    category: categories[c.id] ?? null,
  }));

  const manualMerged = manualChats.map((m) => ({
    id: m.id,
    display_name: m.display_name,
    member_count: 2,
    unread_count: 0,
    last_message_at: m.last_message_at,
    category: (categories[m.id] ?? null) as import("@/lib/types").Category | null,
  }));

  const all = [...merged, ...manualMerged];
  if (wantedId) {
    return NextResponse.json(all.filter((c) => String(c.id) === wantedId));
  }
  return NextResponse.json(all);
}
