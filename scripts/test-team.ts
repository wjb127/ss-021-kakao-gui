import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

async function main() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ss021-team-test-"));
  process.env.KAKAOGUI_DATA_DIR = directory;
  process.env.KAKAOCLI_DB = ""; process.env.KAKAOCLI_KEY = "";
  process.env.KAKAOGUI_DISABLE_WORKER = "1";
  const team = await import("../lib/team-store");
  const db = team.teamDb();
  const adminInvite = team.createTeamUser({ username: "owner", displayName: "관리자", role: "admin" }, null, true);
  const password = "Synthetic-only-Password-42";
  const admin = await team.activateAccount(adminInvite.token, password);
  const viewerInvite = team.createTeamUser({ username: "reader", displayName: "업무 담당자", role: "viewer" }, admin.id);
  let viewer = await team.activateAccount(viewerInvite.token, password);
  assert.equal(team.canReadChat(viewer, "manual_alpha"), false);
  viewer = team.updateTeamUser(admin, viewer.id, { ...viewer, chatIds: ["manual_alpha"] });
  assert.equal(team.canReadChat(viewer, "manual_alpha"), true);
  assert.equal(team.canReadChat(viewer, "manual_secret"), false);
  assert.throws(() => team.updateTeamUser(admin, admin.id, { ...admin, role: "viewer" }));
  assert.throws(() => team.updateTeamUser(admin, viewer.id, { ...viewer, revision: viewer.revision - 1 }));
  await assert.rejects(() => team.activateAccount(viewerInvite.token, password));
  assert.equal(await team.authenticate("reader", "wrong"), null);
  assert.equal((await team.authenticate("reader", password))?.id, viewer.id);
  const adminToken = team.createSession(admin.id);
  let viewerToken = team.createSession(viewer.id);
  const req = (url: string, token?: string, method = "GET", body?: unknown, origin = "http://localhost:3043") => new NextRequest(`http://localhost:3043${url}`, {
    method, headers: { host: "localhost:3043", origin, "content-type": "application/json", ...(token ? { cookie: `${team.SESSION_COOKIE}=${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // 모든 기존 API가 인증되지 않은 요청을 본문 처리 전에 차단하는지 검증한다.
  let endpointCount = 0;
  async function visit(directoryPath: string) {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const file = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name === "route.ts" && !file.includes(`${path.sep}auth${path.sep}`)) {
        const route = await import(path.resolve(file));
        const url = "/api/" + path.relative("app/api", path.dirname(file));
        for (const method of ["GET", "POST", "PATCH", "DELETE", "PUT"]) {
          if (typeof route[method] !== "function") continue;
          assert.equal((await route[method](req(url, undefined, method))).status, 401, `${method} ${url}`);
          endpointCount++;
        }
      }
    }
  }
  await visit("app/api");

  for (const [id, name] of [["manual_alpha", "제작 상담"], ["manual_secret", "비공개 대화"]]) {
    db.prepare("INSERT INTO manual_chats (id, display_name, created_at, last_message_at) VALUES (?, ?, ?, ?)").run(id, name, "2026-09-06", "2026-09-06");
    db.prepare("INSERT INTO categories VALUES (?, 'client')").run(id);
    db.prepare("INSERT INTO memos VALUES (?, ?, ?)").run(id, `needle ${name}`, "2026-09-06");
    db.prepare("INSERT INTO requests (id, chat_id, title, detail, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'question', 'open', ?, ?)").run(id, id, `needle ${name}`, name, "2026-09-06", "2026-09-06");
    db.prepare("INSERT INTO messages (id, chat_id, sender_id, text, is_from_me, timestamp, type) VALUES (?, ?, 'sender', ?, 0, ?, 'text')").run(id, id, `needle ${name}`, "2026-09-06T00:00:00Z");
  }
  const file = path.join(directory, "document.txt"); writeFileSync(file, "private-file", { mode: 0o600 });
  const store = await import("../lib/store");
  store.recordDownload({ messageId: "secret-file", chatId: "manual_secret", filePath: file, url: "", size: 12 });
  store.recordDownload({ messageId: "alpha-file", chatId: "manual_alpha", filePath: file, url: "", size: 12 });
  store.setSetting("telegram_bot_token", "synthetic-sensitive-value");
  const chats = await import("../app/api/chats/route");
  const messages = await import("../app/api/messages/route");
  const exportsRoute = await import("../app/api/messages/export/route");
  const search = await import("../app/api/search/route");
  const requests = await import("../app/api/requests/route");
  const settings = await import("../app/api/settings/route");
  const attachments = await import("../app/api/attachments/route");
  const download = await import("../app/api/download-attachment/route");
  const memo = await import("../app/api/memo/route");
  const teamRoute = await import("../app/api/team/route");
  const login = await import("../app/api/auth/login/route");
  const me = await import("../app/api/auth/me/route");
  const logout = await import("../app/api/auth/logout/route");
  assert.equal((await chats.GET(req("/api/chats", viewerToken)).then((r) => r.json())).length, 1);
  assert.equal((await messages.GET(req("/api/messages?chatId=manual_alpha", viewerToken))).status, 200);
  assert.equal((await messages.GET(req("/api/messages?chatId=manual_secret", viewerToken))).status, 403);
  assert.equal((await exportsRoute.GET(req("/api/messages/export?chatId=manual_secret&scope=all", viewerToken))).status, 403);
  assert.equal((await exportsRoute.GET(req("/api/messages/export?chatId=manual_alpha&scope=all", viewerToken))).status, 200);
  const hits = await search.GET(req("/api/search?q=needle", viewerToken)).then((r) => r.json());
  for (const kind of ["messages", "memos", "requests"]) { assert.equal(hits[kind].length, 1); assert.equal(hits[kind][0].chatId, "manual_alpha"); }
  const scoped = await search.GET(req("/api/search?q=needle&chatId=manual_secret", viewerToken)).then((r) => r.json());
  for (const kind of ["messages", "memos", "requests"]) assert.equal(scoped[kind].length, 0);
  assert.equal((await requests.GET(req("/api/requests", viewerToken)).then((r) => r.json())).requests.length, 1);
  assert.deepEqual(await settings.GET(req("/api/settings", viewerToken)).then((r) => r.json()), { send_enabled: "0" });
  assert.equal((await settings.POST(req("/api/settings", viewerToken, "POST", { send_enabled: "1" }))).status, 403);
  assert.equal((await memo.POST(req("/api/memo", viewerToken, "POST", { chatId: "manual_alpha", content: "unauthorized" }))).status, 403);
  assert.equal((await teamRoute.GET(req("/api/team", viewerToken))).status, 403);
  assert.equal((await attachments.GET(req("/api/attachments?chatId=manual_secret&messageId=secret-file", viewerToken))).status, 403);
  assert.equal((await attachments.GET(req("/api/attachments?chatId=manual_alpha&messageId=secret-file", viewerToken))).status, 404);
  assert.equal(await attachments.GET(req("/api/attachments?chatId=manual_alpha&messageId=alpha-file", viewerToken)).then((r) => r.text()), "private-file");
  assert.notEqual((await download.POST(req("/api/download-attachment", viewerToken, "POST", { chatId: "manual_alpha", messageId: "secret-file" }))).status, 200);
  assert.equal((await settings.POST(req("/api/settings", adminToken, "POST", {}, "https://attacker.example"))).status, 403);
  assert.equal((await login.POST(req("/api/auth/login", undefined, "POST", { username: "reader", password }, "https://attacker.example"))).status, 403);
  const loginResponse = await login.POST(req("/api/auth/login", undefined, "POST", { username: "reader", password }));
  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(loginResponse.headers.get("set-cookie") || "", /SameSite=strict/i);
  const httpsLogin = await login.POST(req("/api/auth/login", undefined, "POST", { username: "reader", password }, "https://localhost:3043"));
  assert.match(httpsLogin.headers.get("set-cookie") || "", /Secure/i);
  assert.equal((await logout.POST(req("/api/auth/logout", viewerToken, "POST"))).status, 200);
  assert.equal((await me.GET(req("/api/auth/me", viewerToken))).status, 401);
  viewerToken = team.createSession(viewer.id);
  viewer = team.updateTeamUser(admin, viewer.id, { ...viewer, chatIds: [] });
  assert.equal((await messages.GET(req("/api/messages?chatId=manual_alpha", viewerToken))).status, 403, "기존 세션에도 권한 회수가 즉시 적용돼야 한다");
  viewer = team.updateTeamUser(admin, viewer.id, { ...viewer, active: false });
  assert.equal(team.sessionUser(viewerToken), null);
  for (let i = 0; i < 9; i++) {
    const invite = team.createTeamUser({ username: `member${i}`, displayName: `담당자 ${i}`, role: "viewer" }, admin.id);
    await team.activateAccount(invite.token, password);
  }
  assert.equal(team.listTeamUsers().filter((u) => u.active).length, 10);
  assert.throws(() => team.createTeamUser({ username: "overflow", displayName: "추가", role: "viewer" }, admin.id));
  assert.throws(() => team.updateTeamUser(admin, viewer.id, { ...viewer, active: true }));
  const expired = team.createSession(admin.id); db.prepare("UPDATE team_sessions SET expires_at = 0 WHERE token_hash = ?").run(team.tokenHash(expired));
  assert.equal(team.sessionUser(expired), null);
  for (let i = 0; i < 10; i++) assert.equal(team.consumeAttempt("rate-test"), true);
  assert.equal(team.consumeAttempt("rate-test"), false);
  const allTokens = team.listTeamUsers().filter((u) => u.active).map((u) => team.createSession(u.id));
  const concurrent = await Promise.all(allTokens.map((token) => me.GET(req("/api/auth/me", token))));
  assert.ok(concurrent.every((r) => r.status === 200));
  const beforeReset = team.createSession(admin.id);
  const passwordRoute = await import("../app/api/auth/password/route");
  const member = team.listTeamUsers().find((u) => u.username === "member0")!;
  const memberSession = team.createSession(member.id);
  const secondSession = team.createSession(member.id);
  const newPassword = "Changed-only-Password-43";
  const changeBody = { currentPassword: password, newPassword, confirmPassword: newPassword, userId: admin.id };
  assert.equal((await passwordRoute.POST(req("/api/auth/password", undefined, "POST", changeBody))).status, 401);
  assert.equal((await passwordRoute.POST(req("/api/auth/password", memberSession, "POST", changeBody, "https://attacker.example"))).status, 403);
  assert.equal((await passwordRoute.POST(req("/api/auth/password", memberSession, "POST", { ...changeBody, currentPassword: "wrong" }))).status, 400);
  assert.equal((await passwordRoute.POST(req("/api/auth/password", memberSession, "POST", { ...changeBody, confirmPassword: "mismatch" }))).status, 400);
  assert.equal((await passwordRoute.POST(req("/api/auth/password", memberSession, "POST", { ...changeBody, newPassword: "short", confirmPassword: "short" }))).status, 400);
  assert.ok(team.sessionUser(secondSession));
  const changed = await passwordRoute.POST(req("/api/auth/password", memberSession, "POST", changeBody));
  assert.equal(changed.status, 200);
  const rotated = changed.headers.get("set-cookie")!.split(";")[0].split("=")[1];
  assert.equal(team.sessionUser(rotated)?.id, member.id);
  assert.equal(team.sessionUser(memberSession), null);
  assert.equal(team.sessionUser(secondSession), null);
  assert.equal(await team.authenticate(member.username, password), null);
  assert.equal((await team.authenticate(member.username, newPassword))?.id, member.id);
  assert.equal((await team.authenticate(admin.username, password))?.id, admin.id);
  const racing = await Promise.allSettled([
    team.changeOwnPassword(member.id, rotated, newPassword, password),
    team.changeOwnPassword(member.id, rotated, newPassword, password),
  ]);
  assert.equal(racing.filter((result) => result.status === "fulfilled").length, 1);
  team.issueInvite(admin.id);
  assert.equal(team.sessionUser(beforeReset), null);
  assert.equal(await team.authenticate("owner", password), null);
  execFileSync(process.execPath, ["--import", "tsx", "scripts/team-setup.ts", "--recover", "owner"], { env: process.env });
  const recovery = readdirSync(directory).find((name) => name.startsWith("team-admin-invite-"));
  assert.ok(recovery, "로컬 관리자 복구 코드가 생성돼야 한다");
  assert.equal(statSync(path.join(directory, recovery)).mode & 0o777, 0o600);
  console.log(`PASS: ${endpointCount}개 API 인증 차단, 10명 제한·동시 세션, 조회 권한·검색·첨부·복사 격리, 세션 회수, 초대·비밀번호·CSRF 검증`);
  console.log(`격리 검증 DB: ${directory}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
