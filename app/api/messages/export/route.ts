import { withTeamApi } from "@/lib/team-auth";
export const GET = withTeamApi(handleGET, "chat");
import { NextResponse, type NextRequest } from "next/server";
import { getCachedMessages } from "@/lib/store";
import { normalizeKakaoEvents } from "@/lib/kakao-events";
import { getDb } from "@/lib/db";
import path from "node:path";
import { expandLongMessages } from "@/lib/long-message";

export const dynamic = "force-dynamic";

async function handleGET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  const scope = req.nextUrl.searchParams.get("scope");
  if (!chatId || (scope !== "all" && scope !== "recent")) {
    return NextResponse.json({ error: "채팅방과 복사 범위를 확인해 주세요." }, { status: 400 });
  }
  const rawDays = req.nextUrl.searchParams.get("days") ?? "2";
  const days = Number(rawDays);
  if (scope === "recent" && (!/^\d+$/.test(rawDays) || !Number.isSafeInteger(days) || days < 1 || days > 3650)) {
    return NextResponse.json({ error: "복사 일수는 1~3650 사이의 정수로 입력해 주세요." }, { status: 400 });
  }
  const since = scope === "recent"
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  let messages;
  try {
    messages = await expandLongMessages(chatId, normalizeKakaoEvents(getCachedMessages(chatId, since)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "원문을 가져오지 못했어요." },
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const sourcePath = !chatId.startsWith("manual_") && process.env.KAKAOCLI_DB
    ? path.resolve(process.env.KAKAOCLI_DB) : null;
  // 복사한 대화의 출처만 제공하며 DB 키나 로그인 정보는 포함하지 않는다.
  const sourceLine = [
    sourcePath ? `카카오 원본 DB: ${sourcePath}` : null,
    `인박스 DB: ${path.resolve(getDb().name)}`,
    `chat_id: ${chatId}`,
  ].filter(Boolean).join(" | ").replace(/[\r\n]+/g, " ");
  return NextResponse.json({ messages, since, sourceLine }, { headers: { "Cache-Control": "no-store" } });
}
