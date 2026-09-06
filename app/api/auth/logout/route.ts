import { NextResponse } from "next/server";
import { withTeamApi } from "@/lib/team-auth";
import { revokeSession, SESSION_COOKIE } from "@/lib/team-store";
export const POST = withTeamApi(async (req) => {
  revokeSession(req.cookies.get(SESSION_COOKIE)?.value || "");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}, "member");
