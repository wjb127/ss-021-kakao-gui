import { withTeamApi } from "@/lib/team-auth";
import { canReadChat } from "@/lib/team-store";
import type { TeamUser } from "@/lib/team-types";
export const GET = withTeamApi(handleGET, "member");
// 채팅 목록 + 카테고리 병합 (kakaocli + manual)
import { after, NextResponse } from "next/server";
import { getRefreshJob, startRefreshJob, waitForRefresh } from "@/lib/refresh-job";
import type { Chat } from "@/lib/types";
import type { NextRequest } from "next/server";
import { getChatSnapshot, listChats } from "@/lib/kakaocli";
import { getCategories, getManualChats } from "@/lib/store";
import { getBoardStates } from "@/lib/board-store";

export const dynamic = "force-dynamic";

// 기본 목록과 특정 방 조회는 전체를 대상으로 한다. 명시한 limit만 제한한다.
const EXPLICIT_LIMIT_MAX = 10_000;

async function handleGET(req: NextRequest, user: TeamUser) {
  const startedAt = performance.now();
  const wantedId = req.nextUrl.searchParams.get("chatId");
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  const askedLimit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, EXPLICIT_LIMIT_MAX)
    : null;
  const limit = wantedId ? 0 : (askedLimit ?? 0);
  const force = req.nextUrl.searchParams.get("fresh") === "1";
  const snapshot = getChatSnapshot(limit);

  const polling = req.nextUrl.searchParams.get("poll") === "1";
  const key = `chats:${limit}`;
  const job = polling ? getRefreshJob<Chat[]>(key)
    : startRefreshJob(key, () => listChats(limit, true), force ? 0 : 15_000);
  if (job?.pending) {
    after(() => job.promise);
    if (!polling && !snapshot) await waitForRefresh(job);
  }
  const [chats, categories, manualChats] = await Promise.all([
    getChatSnapshot(limit) ?? (job && !job.pending && !job.failed ? job.value : null) ?? [],
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

  const boards = getBoardStates();
  const all = [...merged, ...manualMerged].filter((chat) => canReadChat(user, String(chat.id)))
    .map((chat) => ({ ...chat, board: boards.get(String(chat.id)) ?? { stage: "new", revision: 0, position: 0 } }));
  const timing = `chats;dur=${(performance.now() - startedAt).toFixed(1)}`;
  if (wantedId) {
    return NextResponse.json(all.filter((c) => String(c.id) === wantedId), {
      headers: { "X-Refresh-Pending": job?.pending ? "1" : "0", "Server-Timing": timing },
    });
  }
  return NextResponse.json(all, {
    headers: { "X-Chat-Snapshot": snapshot && !polling ? "1" : "0", "Server-Timing": timing,
      "X-Refresh-Pending": job?.pending ? "1" : "0", "X-Refresh-Failed": job?.failed ? "1" : "0" },
  });
}
