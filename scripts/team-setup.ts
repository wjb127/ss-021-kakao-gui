import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { audit, createTeamUser, issueInvite, listTeamUsers } from "../lib/team-store";

// 최초 관리자만 로컬에서 생성한다. 비밀번호·초대 코드는 터미널 로그에 출력하지 않는다.
const recover = process.argv[2] === "--recover";
const username = process.argv[recover ? 3 : 2] || "admin";
let token: string;
if (recover) {
  const admin = listTeamUsers().find((user) => user.username === username && user.active && user.role === "admin");
  if (!admin) throw new Error("활성 관리자 계정을 찾을 수 없습니다.");
  token = issueInvite(admin.id);
  audit(null, "user.invite", admin.id);
} else {
  token = createTeamUser({ username, displayName: "관리자", role: "admin" }, null, true).token;
}
const directory = process.env.KAKAOGUI_DATA_DIR || path.join(os.homedir(), ".kakaocli");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const file = path.join(directory, `team-admin-invite-${Date.now()}.txt`);
writeFileSync(file, token, { mode: 0o600, flag: "wx" });
console.log(`관리자 아이디: ${username}\n초대 코드 파일: ${file}\n로그인 화면에서 ‘초대 코드로 계정 시작’을 선택해 비밀번호를 설정하세요. 코드는 24시간 뒤 만료됩니다.`);
