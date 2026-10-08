import assert from "node:assert/strict";
import { reconcileChats } from "../lib/chat-list-state";
import type { Chat } from "../lib/types";

const previous: Chat[] = Array.from({ length: 1060 }, (_, i) => ({ id: String(i), display_name: `상담 ${i}`, member_count: 2, unread_count: 0, last_message_at: "", category: null }));
assert.equal(reconcileChats(previous, structuredClone(previous)), previous);
const changed = structuredClone(previous);
changed[257].display_name = "홈페이지 가전렌탈";
changed[800].unread_count = 1;
changed[900].board = { stage: "progress", position: 2, revision: 1 };
const next = reconcileChats(previous, changed);
assert.equal(next.length, 1060);
assert.equal(next[0], previous[0]);
assert.notEqual(next[257], previous[257]);
assert.equal(next[800].unread_count, 1);
assert.equal(next[900].board?.stage, "progress");
assert.deepEqual(reconcileChats(previous, changed.slice(0, 2)).map(c => c.id), ["0", "1"], "권한에서 제외된 방을 화면에 남기지 않는다");
assert.deepEqual(reconcileChats(previous, []), []);
console.log("PASS: 변경 없는 행 재사용, 이름/수신/보드 변경 반영, 권한 회수 및 빈 목록 반영");
