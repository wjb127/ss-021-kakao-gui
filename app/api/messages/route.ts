// 특정 채팅의 메시지 조회 (10명 이하: SQLite 캐시 + kakaocli 동기화)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { enrichCachedMessages, listMessages } from "@/lib/kakaocli";
import { normalizeKakaoEvents } from "@/lib/kakao-events";
import {
  getCachedMessageCount,
  getCachedMessagePage,
  getCachedMessages,
  upsertMessages,
} from "@/lib/store";
import type { MessageCursor, MessagePage } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 300;

function parsePageOptions(req: NextRequest): {
  paginated: boolean;
  limit: number;
  before: MessageCursor | null;
} {
  const params = req.nextUrl.searchParams;
  const limitValue = Number.parseInt(params.get("limit") || "", 10);
  const limit = Number.isFinite(limitValue)
    ? Math.max(50, Math.min(limitValue, 500))
    : DEFAULT_PAGE_SIZE;
  const beforeTimestamp = params.get("beforeTimestamp");
  const beforeId = params.get("beforeId");
  return {
    paginated: params.get("paginated") === "1",
    limit,
    before: beforeTimestamp && beforeId
      ? { timestamp: beforeTimestamp, id: beforeId }
      : null,
  };
}

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json(
      { error: "chatId 쿼리 파라미터가 필요함" },
      { status: 400 },
    );
  }
  const { paginated, limit, before } = parsePageOptions(req);
  const shouldSync = req.nextUrl.searchParams.get("sync") !== "0";

  // manual chat은 kakaocli 호출 없이 캐시만 반환
  if (chatId.startsWith("manual_")) {
    if (paginated) {
      return NextResponse.json(getCachedMessagePage(chatId, { before, limit }));
    }
    return NextResponse.json(getCachedMessages(chatId));
  }

  const memberCount = parseInt(
    req.nextUrl.searchParams.get("memberCount") || "0",
    10,
  );
  const shouldCache = memberCount > 0 && memberCount <= 10;

  if (shouldCache) {
    let fresh = [] as Awaited<ReturnType<typeof listMessages>>;
    let deletedMessageIds: string[] = [];
    // 과거 페이지는 SQLite에서만 읽는다. 최신 페이지에서만 카카오 원본과 동기화한다.
    if (!before && shouldSync) {
      const hasCache = getCachedMessageCount(chatId) > 0;
      fresh = await listMessages(
        chatId,
        hasCache ? "2d" : "50d",
        hasCache ? 1000 : 5000,
      );
      deletedMessageIds = fresh
        .map((message) => message.deleted_message_id)
        .filter((id): id is string => !!id);
      upsertMessages(fresh);
    }

    if (paginated) {
      const page = getCachedMessagePage(chatId, { before, limit });
      const cachedMessages = normalizeKakaoEvents(page.messages);
      const messages = shouldSync
        ? await enrichCachedMessages(chatId, cachedMessages)
        : cachedMessages;
      if (shouldSync) upsertMessages(messages);
      const response: MessagePage = {
        ...page,
        messages,
        deletedMessageIds,
      };
      return NextResponse.json(response);
    }

    // SQLite에 누적된 전체 메시지 반환 (카카오 DB 불필요)
    const cached = getCachedMessages(chatId);
    const freshById = new Map(fresh.map((m) => [m.id, m]));
    const senderNames = new Map(
      fresh
        .filter((m) => m.sender_name)
        .map((m) => [m.sender_id, m.sender_name as string]),
    );
    return NextResponse.json(
      normalizeKakaoEvents(cached).map((m) => {
        const f = freshById.get(m.id);
        return {
          ...m,
          sender_name: f?.sender_name ?? senderNames.get(m.sender_id),
          localFilePath: f?.localFilePath,
          attachment: f?.attachment,
          reply: f?.reply ?? m.reply,
          is_edited: f?.is_edited ?? m.is_edited,
        };
      }),
    );
  }

  // 10명 초과: 캐시 없이 직접 조회
  const messages = await listMessages(chatId, "10d", 1000);
  if (paginated) {
    const pageMessages = messages.slice(-limit);
    const response: MessagePage = {
      messages: pageMessages,
      hasMore: false,
      nextCursor: null,
      total: messages.length,
    };
    return NextResponse.json(response);
  }
  return NextResponse.json(messages);
}
