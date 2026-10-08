import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Message } from "../lib/types";

async function main() {
  process.env.KAKAOGUI_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "kakao-long-text-"));
  const { expandLongMessages, readLongTextBody } = await import("../lib/long-message");
  const preview = "긴 본문\n".repeat(800);
  const full = preview + "25화부터 30화까지\n마지막 문장";
  const meta = { mt: "longtext/plain", path: "/talkm/synthetic/body.txt", s: Buffer.byteLength(full) };
  const message: Message = { id: "3945444794037471232", chat_id: "123", text: preview,
    sender_id: "1", is_from_me: false, timestamp: "2026-10-06T07:14:00Z", type: "text" };
  const readRows = async (): Promise<[string, string, string][]> => [[message.id, preview, JSON.stringify(meta)]];
  let downloads = 0;
  const fetcher: typeof fetch = async () => { downloads++; return new Response(full); };
  const expanded = await expandLongMessages("123", [message], { readRows, fetcher });
  assert.equal(expanded[0].text, full);
  assert.equal(message.text, preview);
  assert.equal(downloads, 1);
  assert.equal((await expandLongMessages("123", [message], { readRows, fetcher }))[0].text, full);
  assert.equal(downloads, 1, "재복사 시 원문 캐시 사용");
  const deleted = await expandLongMessages("123", [{ ...message, is_deleted: true }], { readRows: async () => [], fetcher });
  assert.equal(deleted[0].text, full);
  assert.equal(deleted[0].is_deleted, true);
  const revised = full + "\n수정된 결말";
  const updated = await expandLongMessages("123", [message], {
    readRows: async () => [[message.id, preview, JSON.stringify({ ...meta, s: Buffer.byteLength(revised) })]],
    fetcher: async () => new Response(revised),
  });
  assert.equal(updated[0].text, revised, "메타가 바뀌면 이전 캐시 교체");
  await assert.rejects(() => readLongTextBody(preview, meta, async () => new Response(preview), AbortSignal.timeout(1000)), /incomplete/);
  await assert.rejects(() => readLongTextBody(preview, meta, async () => new Response("x".repeat(meta.s)), AbortSignal.timeout(1000)), /mismatch/);
  await assert.rejects(() => readLongTextBody(preview, { ...meta, path: "//localhost/private" }, fetcher, AbortSignal.timeout(1000)), /metadata/);
  await assert.rejects(() => expandLongMessages("456", [{ ...message, chat_id: "456" }], { readRows, fetcher: async () => new Response("expired", { status: 404 }) }), /복사를 중단/);
  await assert.rejects(() => expandLongMessages("123", [message], { readRows: async () => { throw new Error("DB unavailable"); } }), /원문을 확인/);
  assert.equal((await expandLongMessages("manual_1", [message], { readRows: async () => { throw new Error("must not run"); } }))[0], message);
  // 실제 API 경로에서도 인증과 원문 확장을 함께 검증한다.
  const { NextRequest } = await import("next/server");
  const team = await import("../lib/team-store");
  const store = await import("../lib/store");
  const invite = team.createTeamUser({ username: "owner", displayName: "관리자", role: "admin" }, null, true);
  const admin = await team.activateAccount(invite.token, "synthetic-long-message-password");
  const session = team.createSession(admin.id);
  const viewerInvite = team.createTeamUser({ username: "reader", displayName: "담당자", role: "viewer" }, admin.id);
  const viewer = await team.activateAccount(viewerInvite.token, "synthetic-long-message-password");
  const viewerSession = team.createSession(viewer.id);
  store.upsertMessages([{ ...message, chat_id: "789", timestamp: new Date().toISOString() }]);
  const cli = path.join(process.env.KAKAOGUI_DATA_DIR!, "fake-cli");
  const rawMeta = JSON.stringify(meta).replaceAll("/", "\\/");
  writeFileSync(cli, `#!${process.execPath}\nif(process.argv[3].includes("longtext/plain")) process.exit(2);\nconsole.log(${JSON.stringify(JSON.stringify([[message.id, preview, rawMeta]]))});\n`, { mode: 0o700 });
  process.env.KAKAOCLI_BIN = cli;
  const route = await import("../app/api/messages/export/route");
  const request = (scope: string, token?: string) => new NextRequest(`http://localhost/api/messages/export?chatId=789&scope=${scope}`, {
    headers: token ? { cookie: `${team.SESSION_COOKIE}=${token}` } : {},
  });
  assert.equal((await route.GET(request("all"))).status, 401);
  assert.equal((await route.GET(request("all", viewerSession))).status, 403);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    for (const scope of ["all", "recent"]) {
      const response = await route.GET(request(scope, session));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.messages[0].text, full);
      assert.ok(data.sourceLine.includes("chat_id: 789"));
    }
  } finally { globalThis.fetch = originalFetch; }
  console.log("LONG_MESSAGE_OK: full body, cache, edit invalidation, deleted preservation, truncation, mismatch, URL, expiry, DB failure, manual bypass");
  console.log("LONG_MESSAGE_API_OK: authentication, chat permission, escaped metadata, full/recent export");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
