import { NextResponse } from "next/server";
import { authError, withTeamApi } from "@/lib/team-auth";
import { audit, createTeamUser, getTeamUser, issueInvite, listTeamUsers, teamDb, updateTeamUser } from "@/lib/team-store";
import { TEAM_LIMIT } from "@/lib/team-types";

export const GET = withTeamApi(async () => NextResponse.json({
  users: listTeamUsers(), limit: TEAM_LIMIT,
  audit: teamDb().prepare(`SELECT a.action, a.target_id AS targetId, a.created_at AS createdAt,
    u.display_name AS actor FROM team_audit a LEFT JOIN team_users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 50`).all(),
}));

export const POST = withTeamApi(async (req, actor) => {
  try {
    const body = await req.json();
    if (typeof body.username !== "string" || typeof body.displayName !== "string") return authError("아이디와 이름을 입력해 주세요.", 400);
    const result = createTeamUser({ username: body.username.trim().toLowerCase(), displayName: body.displayName, role: body.role }, actor.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return authError(error instanceof Error ? error.message : "계정을 만들지 못했어요.", 400); }
});

export const PATCH = withTeamApi(async (req, actor) => {
  try {
    const body = await req.json();
    if (typeof body.id !== "string") return authError("사용자를 선택해 주세요.", 400);
    const user = getTeamUser(body.id);
    if (!user) return authError("사용자를 찾을 수 없어요.", 404);
    if (body.action === "invite") {
      if (!user.active) return authError("활성 계정만 재초대할 수 있어요.", 400);
      if (user.id === actor.id) return authError("현재 로그인한 계정은 재초대할 수 없어요.", 400);
      const token = issueInvite(user.id);
      audit(actor.id, "user.invite", user.id);
      return NextResponse.json({ token });
    }
    if (body.action === "revoke") {
      teamDb().prepare("DELETE FROM team_sessions WHERE user_id = ?").run(user.id);
      audit(actor.id, "user.revoke", user.id);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.displayName !== "string") return authError("이름을 입력해 주세요.", 400);
    return NextResponse.json({ user: updateTeamUser(actor, user.id, body) });
  } catch (error) { return authError(error instanceof Error ? error.message : "설정을 저장하지 못했어요.", 400); }
});
