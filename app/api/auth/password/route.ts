import { NextResponse } from "next/server";
import { authError, withTeamApi } from "@/lib/team-auth";
import { changeOwnPassword, consumeAttempt, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/team-store";

export const POST = withTeamApi(async (req, user) => {
  if (!consumeAttempt(`password:${user.id}`)) return authError("시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.", 429);
  let body;
  try { body = await req.json(); } catch { return authError("입력 내용을 확인해 주세요.", 400); }
  if (!body || typeof body.currentPassword !== "string" || body.currentPassword.length > 128 || typeof body.newPassword !== "string") return authError("입력 내용을 확인해 주세요.", 400);
  if (body.newPassword.length < 12 || body.newPassword.length > 128) return authError("비밀번호는 12~128자로 입력해 주세요.", 400);
  if (body.newPassword !== body.confirmPassword) return authError("새 비밀번호가 일치하지 않아요.", 400);
  try {
    const token = await changeOwnPassword(user.id, req.cookies.get(SESSION_COOKIE)!.value, body.currentPassword, body.newPassword);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: new URL(req.headers.get("origin")!).protocol === "https:", path: "/", maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    if (error instanceof Error && /^(현재 비밀번호|로그인 상태|비밀번호는)/.test(error.message)) return authError(error.message, 400);
    throw error;
  }
}, "member");
