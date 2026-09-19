import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Chat } from "../lib/types";

async function main() {
  process.env.KAKAOGUI_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss021-board-"));
  process.env.KAKAOCLI_DB = ""; process.env.KAKAOCLI_KEY = "";
  const { observeBoardChats, getBoardState, moveBoardChat } = await import("../lib/board-store");
  const chat: Chat = { id: "123", display_name: "고객 상담", category: "client", member_count: 2, unread_count: 1, last_message_at: "2026-09-13T10:00:00Z" };
  const observe = (unread: number, time: string, id = "90071992547409931") => observeBoardChats([{ ...chat, unread_count: unread, last_message_at: time }], new Map([[chat.id, id]]));
  observe(1, chat.last_message_at);
  assert.deepEqual(getBoardState(chat.id), { stage: "new", revision: 0, position: 0 });
  assert.equal(moveBoardChat(chat.id, "progress", 0).ok, true);
  observe(1, chat.last_message_at);
  assert.equal(getBoardState(chat.id).stage, "progress");
  // 발신으로 최근 시각만 바뀐 경우 단계를 유지한다.
  observe(1, "2026-09-13T10:01:00Z");
  assert.equal(getBoardState(chat.id).stage, "progress");
  // 읽고 새로 수신하여 개수가 같아진 경우도 감지한다.
  observe(1, "2026-09-13T10:02:00Z", "90071992547409932");
  assert.equal(getBoardState(chat.id).stage, "new");
  assert.equal(moveBoardChat(chat.id, "answered", 1).ok, false);
  assert.equal(moveBoardChat(chat.id, "implemented", 2).ok, true);
  observe(0, "2026-09-13T10:02:00Z", "90071992547409932");
  assert.equal(getBoardState(chat.id).stage, "implemented");
  observe(4, "2026-09-12T10:00:00Z");
  assert.equal(getBoardState(chat.id).stage, "implemented");
  observe(1, "2026-09-13T10:03:00Z", "90071992547409933");
  assert.equal(getBoardState(chat.id).stage, "new");

  const team = await import("../lib/team-store");
  const owner = team.createTeamUser({ username: "owner", displayName: "관리자", role: "admin" }, null, true);
  const admin = await team.activateAccount(owner.token, "Synthetic-board-only-Password42");
  const invitation = team.createTeamUser({ username: "reader", displayName: "팀원", role: "viewer" }, admin.id);
  const viewer = await team.activateAccount(invitation.token, "Synthetic-board-only-Password42");
  const token = team.createSession(admin.id);
  const readerToken = team.createSession(viewer.id);
  const { POST } = await import("../app/api/board/route");
  const request = (cookie: string, stage: string, revision: number, origin = "http://localhost:3043", order?: unknown) => new NextRequest("http://localhost:3043/api/board", {
    method: "POST", headers: { host: "localhost:3043", origin, cookie: `${team.SESSION_COOKIE}=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify({ chatId: chat.id, stage, revision, order }),
  });
  assert.equal((await POST(request("", "answered", 4))).status, 401);
  assert.equal((await POST(request(readerToken, "answered", 4))).status, 403);
  assert.equal((await POST(request(token, "answered", 4, "http://untrusted.example"))).status, 403);
  assert.equal((await POST(request(token, "invalid", 4))).status, 400);
  assert.equal((await POST(request(token, "answered", 4, "http://localhost:3043", []))).status, 400);
  assert.equal((await POST(request(token, "answered", 4, "http://localhost:3043", [{ id: chat.id, revision: 4 }, { id: chat.id, revision: 4 }]))).status, 400);
  assert.equal((await POST(request(token, "answered", 3))).status, 409);
  assert.equal((await POST(request(token, "answered", 4))).status, 200);
  assert.equal(getBoardState(chat.id).stage, "answered");
  const { getDb } = await import("../lib/db");
  const stored = getDb().prepare("SELECT stage FROM chat_board WHERE chat_id = ?").get(chat.id) as { stage: string };
  assert.equal(stored.stage, "answered");
  for (const stage of ["reviewed", "payment"] as const) {
    const revision = getBoardState(chat.id).revision;
    assert.equal((await POST(request(readerToken, stage, revision))).status, 403);
    assert.equal((await POST(request(token, stage, revision))).status, 200);
    assert.equal(getBoardState(chat.id).stage, stage);
    observeBoardChats([{ ...chat, unread_count: stage === "reviewed" ? 2 : 3, last_message_at: "2026-09-14T10:00:00Z" }]);
    assert.equal(getBoardState(chat.id).stage, "new", "추가 단계에서도 새 수신은 응대필요로 복귀한다");
  }
  const order = ["b", "a", "c"].map((id) => ({ id, revision: 0 }));
  assert.equal(moveBoardChat("b", "new", 0, order).ok, true);
  assert.deepEqual(order.map((entry) => getBoardState(entry.id).position), [1, 2, 3]);
  assert.equal(moveBoardChat("a", "new", 1, [
    { id: "a", revision: 1 }, { id: "c", revision: 0 }, { id: "b", revision: 1 },
  ]).ok, false);
  assert.equal(getBoardState("a").position, 2, "충돌 시 일부 순서도 변경하면 안 된다");
  assert.equal(moveBoardChat("a", "new", 1, [
    { id: "a", revision: 1 }, { id: "b", revision: 1 }, { id: "c", revision: 1 },
  ]).ok, true);
  assert.equal(getBoardState("a").position, 1);
  assert.equal(moveBoardChat("a", "progress", 2, [{ id: "a", revision: 2 }]).ok, true);
  assert.equal(getBoardState("a").stage, "progress");
  observeBoardChats([{ ...chat, id: "a", unread_count: 1 }]);
  assert.equal(getBoardState("a").stage, "new");
  assert.equal(getBoardState("a").position, 0, "새 수신은 응대필요 맨 위로 이동한다");
  console.log("BOARD_OK: 수신 감지, 순서·단계 저장, 순서 충돌 원자성, 입력 검증, 인증·권한·CSRF");
}
void main();
