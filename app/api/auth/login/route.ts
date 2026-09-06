import { NextRequest, NextResponse } from "next/server";
import { authError, sameOrigin } from "@/lib/team-auth";
import { activateAccount, audit, authenticate, consumeAttempt, createSession, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/team-store";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return authError("요청 출처를 확인할 수 없어요.", 403);
  try {
    const body = await req.json();
    if (typeof body.password !== "string" || body.password.length > 128) return authError("입력 내용을 확인해 주세요.", 400);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase().slice(0, 32) : "";
    // 헤더로 속일 수 있는 IP 대신 계정별 제한과 인스턴스 전체 상한을 함께 적용한다.
    if (!consumeAttempt("login-global", 150) || !consumeAttempt(`login:${username || "activation"}`, 10)) return authError("시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.", 429);
    const user = typeof body.token === "string" && body.token
      ? await activateAccount(body.token, body.password)
      : await authenticate(username, body.password);
    if (!user) return authError("아이디 또는 비밀번호를 확인해 주세요.", 401);
    const token = createSession(user.id);
    audit(user.id, "user.login");
    const response = NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "strict", secure: new URL(req.headers.get("origin")!).protocol === "https:",
      path: "/", maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return authError(error instanceof Error && /비밀번호는|초대 코드/.test(error.message) ? error.message : "입력 내용을 확인해 주세요.", 400);
  }
}
