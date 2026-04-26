// 채팅 목록 + 카테고리 병합
import { NextResponse } from "next/server";
import { listChats } from "@/lib/kakaocli";
import { getCategories } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [chats, categories] = await Promise.all([
    listChats(200),
    getCategories(),
  ]);
  const merged = chats.map((c) => ({
    ...c,
    category: categories[c.id] ?? null,
  }));
  return NextResponse.json(merged);
}
