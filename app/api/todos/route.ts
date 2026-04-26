// 저장된 분석 결과 조회
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTodoForChat } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json(
      { error: "chatId 가 필요함" },
      { status: 400 },
    );
  }
  const todo = await getTodoForChat(chatId);
  return NextResponse.json(todo);
}
