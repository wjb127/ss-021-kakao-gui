import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file: string, globals: Record<string, unknown>) {
  const exports: Record<string, (...args: any[]) => any> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...globals });
  return exports;
}

const saved = Array.from({ length: 1100 }, (_, i) => ({ id: String(i) }));
let cutoff: string | undefined;
const route = load("app/api/messages/export/route.ts", {
  require: (name: string) => ({
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/store": { getCachedMessages: (_id: string, since?: string) => { cutoff = since; return saved; } },
    "@/lib/kakao-events": { normalizeKakaoEvents: (data: unknown) => data },
  } as Record<string, unknown>)[name],
});
const req = (query: string) => ({ nextUrl: new URL(`http://localhost/?${query}`) });
const all = await route.GET(req("chatId=123&scope=all"));
assert.equal((await all.json()).messages.length, 1100, "화면의 300건 제한을 적용하지 않는다");
assert.equal(cutoff, undefined);
const now = Date.now();
await route.GET(req("chatId=123&scope=recent"));
assert.ok(Math.abs(new Date(cutoff!).getTime() - (now - 172800000)) < 1000);
assert.equal((await route.GET(req("scope=all"))).status, 400);
assert.equal((await route.GET(req("chatId=123&scope=wrong"))).status, 400);

let resolveText!: (text: string) => void;
let clipboardStarted = false;
let output: Promise<Blob> | undefined;
const clipboard = load("lib/clipboard.ts", {
  window: { isSecureContext: true }, Blob,
  ClipboardItem: class {
    data: Record<string, Promise<Blob>>;
    constructor(data: Record<string, Promise<Blob>>) { this.data = data; }
  },
  navigator: { clipboard: {
    writeText: async () => { throw new Error("즉시 쓰기 경로를 사용해야 한다"); },
    write: async (items: Array<{ data: Record<string, Promise<Blob>> }>) => {
      clipboardStarted = true;
      output = items[0].data["text/plain"];
      await output;
    },
  } },
});
const pending = clipboard.copyDeferredText(() => new Promise<string>((resolve) => { resolveText = resolve; }));
assert.equal(clipboardStarted, true, "서버 응답 전에 클릭 권한으로 쓰기를 시작해야 한다");
resolveText("전체 대화 1100건");
await pending;
assert.equal(await (await output!).text(), "전체 대화 1100건");
console.log("PASS: 전체 1100건, 최근 48시간, 잘못된 입력, 비동기 클립보드 클릭 권한");
