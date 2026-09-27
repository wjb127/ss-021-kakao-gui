import { NextResponse } from "next/server";
import { withTeamApi } from "@/lib/team-auth";
import { canReadChat, listTeamUsers } from "@/lib/team-store";
import { listChatWork } from "@/lib/work-store";
import { getBoardState } from "@/lib/board-store";
import { getManualChats, getSetting } from "@/lib/store";
import { koreaDate, workTasks } from "@/lib/task-agenda";

export const GET = withTeamApi(async (_req, user) => {
  const names = new Map<string, string>();
  try {
    const snapshot = JSON.parse(getSetting("chat_list_snapshot") || "[]");
    if (Array.isArray(snapshot)) for (const chat of snapshot) {
      if (chat?.id && typeof chat.display_name === "string") names.set(String(chat.id), chat.display_name);
    }
  } catch { /* 이름 캐시가 없으면 대화 ID로 표시한다. */ }
  const manualChats = getManualChats();
  const manualIds = new Set(manualChats.map((chat) => chat.id));
  for (const chat of manualChats) names.set(chat.id, chat.display_name);
  const users = new Map(listTeamUsers().map((member) => [member.id, member.displayName]));
  const tasks = listChatWork().filter(({ chatId }) => canReadChat(user, chatId)
    && (!chatId.startsWith("manual_") || manualIds.has(chatId))).flatMap(({ chatId, work }) =>
    workTasks(work, { chatId, chatName: names.get(chatId) || chatId, assigneeId: work.assigneeId,
      assigneeName: users.get(work.assigneeId) || "담당 미지정", stage: getBoardState(chatId).stage }));
  tasks.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.chatName.localeCompare(b.chatName, "ko") || a.id.localeCompare(b.id));
  return NextResponse.json({ today: koreaDate(), tasks });
}, "member");
