import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "kakao-chat-list-"));
  process.env.KAKAOGUI_DATA_DIR = directory;
  process.env.KAKAOCLI_DB = "synthetic";
  process.env.KAKAOCLI_KEY = "synthetic";
  process.env.KAKAOCLI_USER_ID = "";
  const cli = path.join(directory, "cli");
  process.env.KAKAOCLI_BIN = cli;
  writeFileSync(cli, `#!${process.execPath}
const args=process.argv.slice(2);
if(args[0]==='chats') {
  const count=Number(args[args.indexOf('--limit')+1]);
  console.log(JSON.stringify(Array.from({length:Math.min(count,1058)},(_,i)=>({id:String(i+1),display_name:'기존 이름',member_count:2,unread_count:0,last_message_at:i===0?undefined:i===1?null:'2026-08-21T05:30:23Z'}))));
} else if(args[1].includes('COUNT(*)')) console.log('[[1058]]');
else if(args[1].includes('NTChatMeta')) console.log(JSON.stringify([['257','홈페이지 가전렌탈'],['1001','오래된 고객방']]));
else console.log('[]');
`, { mode: 0o700 });
  const { listChats, getChatSnapshot } = await import("../lib/kakaocli");
  const { setCategory, getCategories, setSetting } = await import("../lib/store");
  setSetting("chat_list_snapshot", JSON.stringify([
    { id: "1", display_name: "이전 캐시 날짜 누락" },
    { id: "2", display_name: "이전 캐시 날짜 null", last_message_at: null },
  ]));
  assert.deepEqual(getChatSnapshot(0)?.map(c => c.last_message_at), ["", ""]);
  await setCategory("257", "client");
  const all = await listChats(0, true);
  assert.equal(all.length, 1058);
  assert.equal(all.find(c => c.id === "1")?.last_message_at, "");
  assert.equal(all.find(c => c.id === "2")?.last_message_at, "");
  assert.deepEqual([...all].sort((a,b) => b.last_message_at.localeCompare(a.last_message_at)).slice(-2).map(c => c.id), ["1", "2"]);
  assert.equal(all.find(c => c.id === "257")?.display_name, "홈페이지 가전렌탈");
  assert.equal(all.find(c => c.id === "1001")?.display_name, "오래된 고객방");
  assert.equal((await getCategories())["257"], "client");
  assert.equal((await listChats(200, true)).length, 200);
  assert.equal(getChatSnapshot(0)?.length, 1058, "작은 워커 조회가 전체 스냅샷을 잘라내지 않음");
  assert.equal((await listChats(0)).length, 1058);
  console.log("CHAT_LIST_OK: 전체 1058개, 257/1001번째 방 보존, 사용자 지정 이름 우선, 고객 분류 보존, 워커 캐시 회귀");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
