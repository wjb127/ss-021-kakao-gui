import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { audit, canReadChat, SESSION_COOKIE, sessionUser } from "./team-store";
import type { TeamUser } from "./team-types";

export async function currentUser() {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  // 프록시가 전달한 임의의 X-Forwarded-* 값을 신뢰하지 않는다.
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === host;
  } catch { return false; }
}

export function authError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

type Handler = (req: NextRequest, user: TeamUser) => Promise<Response>;
export function withTeamApi(handler: Handler, access: "admin" | "chat" | "member" = "admin") {
  return async (req: NextRequest) => {
    const user = sessionUser(req.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return authError("로그인이 필요해요.", 401);
    if (!["GET", "HEAD"].includes(req.method) && !sameOrigin(req)) return authError("요청 출처를 확인할 수 없어요.", 403);
    if (access === "admin" && user.role !== "admin") return authError("관리자만 사용할 수 있어요.", 403);
    if (access === "chat") {
      let chatId = req.nextUrl.searchParams.get("chatId");
      if (!["GET", "HEAD"].includes(req.method)) {
        try { chatId = (await req.clone().json()).chatId; }
        catch { return authError("요청 형식을 확인해 주세요.", 400); }
      }
      if (!chatId || typeof chatId !== "string") return authError("채팅방을 선택해 주세요.", 400);
      if (!canReadChat(user, chatId)) return authError("조회 권한이 없는 채팅방이에요.", 403);
    }
    try {
      const response = await handler(req, user);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
      if (!["GET", "HEAD"].includes(req.method) && response.ok) audit(user.id, `${req.method} ${req.nextUrl.pathname}`);
      return response;
    } catch (error) {
      console.error("팀 API 처리 실패", req.nextUrl.pathname, error instanceof Error ? error.name : "unknown");
      return authError("요청을 처리하지 못했어요. 다시 시도해 주세요.", 500);
    }
  };
}
