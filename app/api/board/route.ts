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
  if (body.order !== undefined && (!Array.isArray(body.order) || body.order.length < 1 || body.order.length > 1000
    || body.order.some((entry: { id?: unknown; revision?: unknown } | null) => !entry || typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 200 || !Number.isSafeInteger(entry.revision) || Number(entry.revision) < 0)
    || new Set(body.order.map((entry: { id: string }) => entry.id)).size !== body.order.length
    || !body.order.some((entry: { id: string; revision: number }) => entry.id === body.chatId && entry.revision === body.revision))) {
    return NextResponse.json({ error: "카드 순서를 확인해 주세요." }, { status: 400 });
  }
  const result = moveBoardChat(body.chatId, body.stage, body.revision, body.order);
  return NextResponse.json(result.ok ? { ...result.state, states: result.states } : { ...result.state, error: "새 메시지 또는 다른 변경이 있어요. 확인 후 다시 이동해 주세요." },
    { status: result.ok ? 200 : 409 });
});
