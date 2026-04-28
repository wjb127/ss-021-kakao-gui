// 채팅 목록 + 카테고리 병합 (kakaocli + manual)
import { NextResponse } from "next/server";
import { listChats } from "@/lib/kakaocli";
import { getCategories, getManualChats } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [chats, categories, manualChats] = await Promise.all([
    listChats(200),
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

  return NextResponse.json([...merged, ...manualMerged]);
}
