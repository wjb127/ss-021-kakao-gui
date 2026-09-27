import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { agendaGroup, koreaDate, workTasks } from "../lib/task-agenda";
import { EMPTY_WORK } from "../lib/work-types";

async function main() {
  assert.equal(koreaDate(new Date("2026-09-27T15:00:00Z")), "2026-09-28");
  assert.equal(agendaGroup("2026-09-27", "2026-09-28"), "overdue");
  assert.equal(agendaGroup("2026-09-28", "2026-09-28"), "today");
  assert.equal(agendaGroup("2026-10-04", "2026-09-28"), "week");
  assert.equal(agendaGroup("2026-10-05", "2026-09-28"), "later");
  assert.equal(agendaGroup("2026-09-28", "2026-09-27"), "later", "일요일에는 다음 월요일을 이번 주로 넣지 않는다");
  assert.equal(agendaGroup("", "2026-09-28"), "undated");
  const work = { ...EMPTY_WORK, deadline: "2026-09-28", nextContact: "2026-09-29", items: [
    { id: "a", title: "미완료 작업", done: false, sourceId: null },
    { id: "b", title: "완료 작업", done: true, sourceId: null },
  ] };
  const context = { chatId: "manual_allowed", chatName: "허용 대화", assigneeId: "", assigneeName: "미지정", stage: "progress" as const };
  assert.equal(workTasks(work, context).length, 3);
  assert.equal(workTasks(work, context).find((task) => task.kind === "할 일")?.date, work.deadline);
  assert.equal(workTasks(work, { ...context, stage: "answered" }).length, 0);
  process.env.KAKAOGUI_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss021-tasks-test-"));
  process.env.KAKAOGUI_DISABLE_WORKER = "1";
  const team = await import("../lib/team-store");
  const owner = team.createTeamUser({ username: "owner", displayName: "관리자", role: "admin" }, null, true);
  const admin = await team.activateAccount(owner.token, "Synthetic-only-Password-42");
  const invitation = team.createTeamUser({ username: "reader", displayName: "담당자", role: "viewer" }, admin.id);
  const viewer = await team.activateAccount(invitation.token, "Synthetic-only-Password-42");
  team.updateTeamUser(admin, viewer.id, { ...viewer, chatIds: ["manual_allowed"] });
  const { saveChatWork } = await import("../lib/work-store");
  for (const id of ["manual_allowed", "manual_secret"]) team.teamDb().prepare("INSERT INTO manual_chats VALUES (?, ?, ?, ?)").run(id, id, "2026-09-27", "2026-09-27");
  saveChatWork("manual_allowed", work); saveChatWork("manual_secret", work);
  saveChatWork("manual_deleted", work);
  const { GET } = await import("../app/api/tasks/route");
  const req = (token?: string) => new NextRequest("http://localhost/api/tasks", { headers: token ? { cookie: `${team.SESSION_COOKIE}=${token}` } : {} });
  assert.equal((await GET(req())).status, 401);
  const response = await GET(req(team.createSession(viewer.id)));
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const data = await response.json();
  assert.equal(data.tasks.length, 3);
  assert.ok(data.tasks.every((task: { chatId: string }) => task.chatId === "manual_allowed"));
  assert.equal((await GET(req(team.createSession(admin.id))).then((r) => r.json())).tasks.length, 6);
  console.log("PASS: 한국 날짜/주 경계, 완료 제외, 마감일 연결, 로그인 및 대화별 권한 격리");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
