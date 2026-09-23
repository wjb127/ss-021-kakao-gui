import { NextResponse } from "next/server";
import { withTeamApi } from "@/lib/team-auth";
import { getChatWork, saveChatWork } from "@/lib/work-store";
import { canReadChat, listTeamUsers, audit } from "@/lib/team-store";
import { getBoardState } from "@/lib/board-store";
import { getDb } from "@/lib/db";
import type { ChatWork } from "@/lib/work-types";

export const GET = withTeamApi(async (req) => {
  const chatId = req.nextUrl.searchParams.get("chatId")!;
  return NextResponse.json({ work: getChatWork(chatId), board: getBoardState(chatId),
    assignees: listTeamUsers().filter((user) => user.active && canReadChat(user, chatId))
      .map((user) => ({ id: user.id, name: user.displayName })) });
}, "chat");

function validDate(value: unknown) {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const POST = withTeamApi(async (req, actor) => {
  const body = await req.json().catch(() => null);
  const work = body?.work;
  if (typeof body?.chatId !== "string" || !body.chatId.trim() || body.chatId.length > 200 || !work
    || !Number.isSafeInteger(work.revision) || work.revision < 0
    || typeof work.assigneeId !== "string" || work.assigneeId.length > 200
    || !validDate(work.nextContact) || !validDate(work.deadline)
    || typeof work.waitingFor !== "string" || work.waitingFor.length > 3000
    || !Array.isArray(work.items) || work.items.length > 100
    || work.items.some((item: unknown) => {
      if (!item || typeof item !== "object") return true;
      const value = item as Record<string, unknown>;
      return typeof value.id !== "string" || !value.id || value.id.length > 100
        || typeof value.title !== "string" || !value.title.trim() || value.title.length > 500
        || typeof value.done !== "boolean"
        || (value.sourceId !== null && (typeof value.sourceId !== "string" || !value.sourceId || value.sourceId.length > 200));
    }) || new Set(work.items.map((item: { id: string }) => item.id)).size !== work.items.length) {
    return NextResponse.json({ error: "담당자, 날짜와 할 일 입력을 확인해 주세요." }, { status: 400 });
  }
  const chatId = body.chatId;
  if (work.assigneeId && !listTeamUsers().some((user) => user.id === work.assigneeId && user.active && canReadChat(user, chatId))) {
    return NextResponse.json({ error: "이 대화에 접근 가능한 활성 팀원을 선택해 주세요." }, { status: 400 });
  }
  const read = getDb().prepare("SELECT 1 FROM messages WHERE chat_id = ? AND id = ?");
  if (work.items.some((item: { sourceId: string | null }) => item.sourceId && !read.get(chatId, item.sourceId))) {
    return NextResponse.json({ error: "현재 대화에 저장된 원문 메시지를 선택해 주세요." }, { status: 400 });
  }
  const clean: ChatWork = { revision: work.revision, assigneeId: work.assigneeId, nextContact: work.nextContact,
    deadline: work.deadline, waitingFor: work.waitingFor, items: work.items.map((item: ChatWork["items"][number]) =>
      ({ id: item.id, title: item.title.trim(), done: item.done, sourceId: item.sourceId })) };
  if (!saveChatWork(chatId, clean)) return NextResponse.json({ error: "다른 변경이 있어요. 입력 내용을 확인하고 최신 정보를 불러와 주세요." }, { status: 409 });
  audit(actor.id, "work.save", chatId);
  return NextResponse.json({ work: getChatWork(chatId) });
}, "admin");
