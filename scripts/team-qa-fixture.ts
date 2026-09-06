import { mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

async function main() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ss021-team-ui-"));
  process.env.KAKAOGUI_DATA_DIR = directory;
  const team = await import("../lib/team-store");
  const password = randomBytes(24).toString("base64url");
  const owner = team.createTeamUser({ username: "admin", displayName: "운영 관리자", role: "admin" }, null, true);
  const admin = await team.activateAccount(owner.token, password);
  const invite = team.createTeamUser({ username: "viewer", displayName: "업무 담당자", role: "viewer" }, admin.id);
  const viewer = await team.activateAccount(invite.token, password);
  team.updateTeamUser(admin, viewer.id, { ...viewer, chatIds: ["manual_design", "manual_review"] });
  const db = team.teamDb();
  for (const [id, name, text] of [
    ["manual_design", "홈페이지 제작 상담", "메인 화면 이미지와 문구를 보내드렸습니다. 확인 부탁드립니다."],
    ["manual_review", "브랜드 사이트 콘텐츠 검토 및 수정 일정 확인", "수정 범위 확인했습니다. 다음 주 화요일에 검토하겠습니다."],
    ["manual_private", "내부 운영 대화", "월간 운영 일정과 업무 배분을 확인합니다."],
  ]) {
    db.prepare("INSERT INTO manual_chats (id, display_name, created_at, last_message_at) VALUES (?, ?, ?, ?)").run(id, name, new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO categories VALUES (?, 'client')").run(id);
    db.prepare("INSERT INTO memos VALUES (?, ?, ?)").run(id, "전달받은 자료 확인 후 일정 안내", new Date().toISOString());
    db.prepare("INSERT INTO messages (id, chat_id, sender_id, sender_name, text, is_from_me, timestamp, type) VALUES (?, ?, 'customer', '고객', ?, 0, ?, 'text')").run(id, id, text, new Date().toISOString());
  }
  writeFileSync(path.join(directory, "credentials.json"), JSON.stringify({ password }), { mode: 0o600 });
  console.log(directory);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
