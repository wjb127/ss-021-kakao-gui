import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const directory = process.env.KAKAOGUI_DATA_DIR;
  if (!directory || !path.basename(directory).startsWith("ss021-team-ui-")) throw new Error("격리된 UI 검증 DB 경로가 필요합니다.");
  const origin = "http://localhost:3043";
  const { password } = JSON.parse(readFileSync(path.join(directory, "credentials.json"), "utf8"));
  const team = await import("../lib/team-store");
  const admin = team.listTeamUsers().find((u) => u.role === "admin")!;
  while (team.listTeamUsers().filter((u) => u.active).length < 10) {
    const i = team.listTeamUsers().length;
    team.createTeamUser({ username: `person${i}`, displayName: `담당자 ${i}`, role: "viewer" }, admin.id);
  }
  for (const user of team.listTeamUsers()) {
    if (!user.ready) await team.activateAccount(team.issueInvite(user.id), password);
    if (user.role === "viewer") {
      const current = team.getTeamUser(user.id)!;
      team.updateTeamUser(admin, user.id, { ...current, chatIds: ["manual_design"] });
    }
  }
  const users = team.listTeamUsers().filter((u) => u.active);
  const cookies = await Promise.all(users.map(async (user) => {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username: user.username, password }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") || "", /HttpOnly/i);
    return { user, cookie: response.headers.get("set-cookie")!.split(";")[0] };
  }));
  const start = performance.now();
  const latencies: number[] = [];
  await Promise.all(cookies.map(async ({ user, cookie }) => {
    for (let index = 0; index < 10; index++) {
      const begin = performance.now();
      const response = await fetch(`${origin}/api/chats`, { headers: { cookie } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      const chats = await response.json();
      assert.equal(chats.length, user.role === "admin" ? 3 : 1);
      if (user.role === "viewer") assert.equal(chats[0].id, "manual_design");
      latencies.push(performance.now() - begin);
    }
  }));
  const viewer = cookies.find((c) => c.user.role === "viewer")!;
  for (const url of ["/api/messages?chatId=manual_private", "/api/messages/export?chatId=manual_private&scope=all", "/api/team"]) {
    assert.equal((await fetch(origin + url, { headers: { cookie: viewer.cookie } })).status, 403);
  }
  assert.equal((await fetch(origin + "/api/chats")).status, 401);
  const csrf = await fetch(origin + "/api/settings", { method: "POST", headers: { cookie: cookies.find((c) => c.user.role === "admin")!.cookie, origin: "http://untrusted.example", "content-type": "application/json" }, body: "{}" });
  assert.equal(csrf.status, 403);
  latencies.sort((a, b) => a - b);
  console.log(JSON.stringify({ result: "PASS", users: users.length, requests: latencies.length, elapsedMs: Math.round(performance.now() - start), p95Ms: Math.round(latencies[Math.floor(latencies.length * .95)]), scope: "격리 데이터·로컬 HTTP 인증 및 조회" }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
