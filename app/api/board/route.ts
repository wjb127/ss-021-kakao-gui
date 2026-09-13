import { NextResponse } from "next/server";
import { withTeamApi } from "@/lib/team-auth";
import { isBoardStage } from "@/lib/board-types";
import { moveBoardChat } from "@/lib/board-store";

export const POST = withTeamApi(async (req) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.chatId !== "string" || !body.chatId.trim() || body.chatId.length > 200
    || !isBoardStage(body.stage) || !Number.isSafeInteger(body.revision) || body.revision < 0) {
    return NextResponse.json({ error: "단계 변경 값을 확인해 주세요." }, { status: 400 });
  }
  const result = moveBoardChat(body.chatId, body.stage, body.revision);
  return NextResponse.json(result.ok ? result.state : { ...result.state, error: "새 메시지 또는 다른 변경이 있어요. 확인 후 다시 이동해 주세요." },
    { status: result.ok ? 200 : 409 });
});
