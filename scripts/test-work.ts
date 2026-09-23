import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

async function main() {
  process.env.KAKAOGUI_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss021-work-test-"));
  process.env.KAKAOGUI_DISABLE_WORKER = "1";
  process.env.KAKAOCLI_DB = "";
  const team = await import("../lib/team-store");
  const password = "Synthetic-only-Password-42";
  const invite = team.createTeamUser({ username: "owner", displayName: "관리자", role: "admin" }, null, true);
  const admin = await team.activateAccount(invite.token, password);
  const readerInvite = team.createTeamUser({ username: "reader", displayName: "담당자", role: "viewer" }, admin.id);
  const reader = await team.activateAccount(readerInvite.token, password);
  team.updateTeamUser(admin, reader.id, { ...reader, chatIds: ["manual_alpha"] });
  const adminToken = team.createSession(admin.id), readerToken = team.createSession(reader.id);
  const { getDb } = await import("../lib/db");
  for (const [id, chatId] of [["old", "manual_alpha"], ["secret", "manual_secret"]]) {
    getDb().prepare("INSERT INTO messages(id, chat_id, sender_id, text, is_from_me, timestamp, type) VALUES (?, ?, 'customer', '이미지 수정 요청', 0, '2020-01-01T00:00:00Z', 'text')").run(id, chatId);
  }
  const { GET, POST } = await import("../app/api/work/route");
  const req = (token: string | null, method = "GET", chatId = "manual_alpha", work?: unknown, origin = "http://localhost:3143") => new NextRequest(`http://localhost:3143/api/work?chatId=${chatId}`, {
    method, headers: { host: "localhost:3143", origin, "content-type": "application/json", ...(token ? { cookie: `${team.SESSION_COOKIE}=${token}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify({ chatId, work }) } : {}),
  });
  assert.equal((await GET(req(null))).status, 401);
  assert.equal((await GET(req(readerToken, "GET", "manual_secret"))).status, 403);
  const initial = await GET(req(readerToken)).then((response) => response.json());
  assert.equal(initial.work.revision, 0);
  assert.ok(initial.assignees.some((user: { id: string }) => user.id === reader.id));
  assert.equal(initial.assignees[0].chatIds, undefined, "권한 목록과 계정 상세는 노출하지 않는다");
  const work = { ...initial.work, assigneeId: reader.id, nextContact: "2026-10-01", deadline: "2026-10-10", waitingFor: "로고 원본",
    items: [{ id: "task1", title: "메인 이미지 교체", done: false, sourceId: "old" }] };
  assert.equal((await POST(req(readerToken, "POST", "manual_alpha", work))).status, 403);
  assert.equal((await POST(req(adminToken, "POST", "manual_alpha", work, "http://elsewhere.test"))).status, 403);
  for (const patch of [
    { deadline: "2026-02-30" }, { assigneeId: "missing" }, { revision: -1 },
    { items: [{ ...work.items[0], sourceId: "secret" }] }, { items: [{ ...work.items[0], title: " " }] },
    { items: [work.items[0], work.items[0]] },
  ]) assert.equal((await POST(req(adminToken, "POST", "manual_alpha", { ...work, ...patch }))).status, 400);
  assert.equal((await POST(req(adminToken, "POST", "manual_secret", work))).status, 400, "담당자의 대화 접근 권한을 확인한다");
  const saved = await POST(req(adminToken, "POST", "manual_alpha", work));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).work.revision, 1);
  assert.equal((await POST(req(adminToken, "POST", "manual_alpha", { ...work, waitingFor: "덮어쓰기" }))).status, 409);
  const loaded = await GET(req(readerToken)).then((response) => response.json());
  assert.equal(loaded.work.waitingFor, "로고 원본");
  assert.equal(loaded.work.items[0].sourceId, "old");
  assert.equal((await POST(req(adminToken, "POST", "manual_alpha", { ...loaded.work, items: [{ ...work.items[0], done: true }] }))).status, 200);
  const completed = await GET(req(adminToken)).then((response) => response.json());
  assert.equal(completed.work.items[0].done, true);
  assert.equal(completed.work.revision, 2);
  assert.equal((await GET(req(adminToken, "GET", "manual_secret")).then((response) => response.json())).work.items.length, 0);
  console.log("PASS: 업무 저장/완료/격리, 채팅별 조회 권한, 관리자 수정, CSRF, 담당자/원문/날짜 검증, 동시 저장 충돌");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
