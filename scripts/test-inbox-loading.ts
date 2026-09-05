import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// 원본 카카오 DB를 건드리지 않고 실제 라우트의 빠른 경로를 검증한다.
function loadRoute(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, (req: unknown) => Promise<Response>> = {};
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: (name: string) => {
      assert.ok(name in dependencies, `예상하지 않은 의존성: ${name}`);
      return dependencies[name];
    },
    console,
  });
  return exports.GET;
}
const request = (query: string) => ({ nextUrl: new URL(`http://localhost/api?${query}`) });
const deferred: Array<() => Promise<void>> = [];
const next = {
  NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) },
  after: (fn: () => Promise<void>) => deferred.push(fn),
};
let sourceCalls = 0;
const room = { id: "123", display_name: "대화", member_count: 2 };
const chats = loadRoute("app/api/chats/route.ts", {
  "next/server": next,
  "@/lib/kakaocli": {
    getChatSnapshot: () => [room],
    listChats: async () => { sourceCalls++; return [room]; },
  },
  "@/lib/store": { getCategories: async () => ({}), getManualChats: () => [] },
});
assert.equal((await chats(request(""))).headers.get("X-Chat-Snapshot"), "1");
assert.equal(sourceCalls, 0, "저장된 목록은 원본 조회 없이 반환해야 한다");
await chats(request("fresh=1"));
assert.equal(sourceCalls, 1, "백그라운드 갱신은 원본을 조회해야 한다");

let count = 10;
let sourceWindow = "";
let backfills = 0;
let enrichments = 0;
const page = { messages: [], total: 10, hasMore: false, nextCursor: null };
const messages = loadRoute("app/api/messages/route.ts", {
  "next/server": next,
  "@/lib/kakaocli": {
    listMessages: async (_id: string, since: string) => { sourceWindow = since; return []; },
    enrichCachedMessages: async () => { enrichments++; return []; },
  },
  "@/lib/message-backfill": {
    backfillMessages: async () => { backfills++; },
    isBackfillPending: () => false,
  },
  "@/lib/kakao-events": { normalizeKakaoEvents: (value: unknown) => value },
  "@/lib/store": {
    getCachedMessageCount: () => count,
    getCachedMessagePage: () => page,
    upsertMessages: () => {},
  },
});
await messages(request("chatId=123&memberCount=2&paginated=1&sync=0"));
assert.equal(sourceWindow, "", "캐시 조회에서 원본을 호출하면 안 된다");
await messages(request("chatId=123&memberCount=2&paginated=1&beforeTimestamp=2026-01-01&beforeId=1"));
assert.equal(sourceWindow, "", "과거 페이지에서 원본을 호출하면 안 된다");
assert.equal(enrichments, 0);
count = 0;
await messages(request("chatId=123&memberCount=2&paginated=1"));
assert.equal(sourceWindow, "3d");
assert.equal(backfills, 0, "과거 보충은 최신 응답 이후 실행해야 한다");
assert.equal(enrichments, 0, "첨부 보정은 최신 응답을 지연시키면 안 된다");
for (const fn of deferred) await fn();
assert.equal(backfills, 1);
assert.equal(enrichments, 1);
console.log("PASS: 목록 즉시 응답, 원본 갱신, 캐시 페이지, 최근 3일 우선, 과거·첨부 후처리");
