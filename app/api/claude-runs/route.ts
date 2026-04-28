// Claude 실행 조회 (?id=runId 단건, ?chatId=xxx 리스트)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClaudeRun, listClaudeRunsByChat } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const run = getClaudeRun(id);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(run);
  }

  const chatId = req.nextUrl.searchParams.get("chatId");
  if (chatId) {
    const runs = listClaudeRunsByChat(chatId, 20);
    return NextResponse.json(runs);
  }

  return NextResponse.json({ error: "id 또는 chatId 필요" }, { status: 400 });
}
