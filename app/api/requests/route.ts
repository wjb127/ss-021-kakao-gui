// 고객 요청 조회 / 상태변경 / 수동 추출
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  listRequests,
  updateRequestStatus,
  getDailyCount,
} from "@/lib/store";
import { extractRequestsForChat } from "@/lib/request-extractor";
import type { RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_STATUS: RequestStatus[] = ["open", "in_progress", "done", "dismissed"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status");
  const status =
    statusParam && VALID_STATUS.includes(statusParam as RequestStatus)
      ? (statusParam as RequestStatus)
      : undefined;
  const chatId = sp.get("chatId") ?? undefined;

  return NextResponse.json({
    requests: listRequests({ status, chatId }),
    extractedToday: getDailyCount("extract_count"),
  });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = (await req.json()) as {
    id?: string;
    status?: string;
  };
  if (!id || !status || !VALID_STATUS.includes(status as RequestStatus)) {
    return NextResponse.json(
      { error: "id, status(open|in_progress|done|dismissed) 필수" },
      { status: 400 },
    );
  }
  const ok = updateRequestStatus(id, status as RequestStatus);
  if (!ok) return NextResponse.json({ error: "해당 요청 없음" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 수동 추출 트리거 (디바운스 무시)
export async function POST(req: NextRequest) {
  const { chatId } = (await req.json()) as { chatId?: string };
  if (!chatId) {
    return NextResponse.json({ error: "chatId 필수" }, { status: 400 });
  }
  const result = await extractRequestsForChat(chatId, { force: true });
  return NextResponse.json(result);
}
