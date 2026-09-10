import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { NextRequest } from "next/server";
import { normalizeAttachmentMessage, mergeExportMessages } from "../lib/message-attachments";
import { downloadAttachmentTasks } from "../lib/attachment-downloader";
import type { Message } from "../lib/types";

async function main() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ss021-attachments-"));
  process.env.KAKAOGUI_DATA_DIR = directory;
  process.env.KAKAOGUI_DISABLE_WORKER = "1";
  const store = await import("../lib/store");
  const team = await import("../lib/team-store");
  const { getDb } = await import("../lib/db");
  const db = getDb();
  const base: Message = { id: "1234567890123456789", chat_id: "manual_files", sender_id: "customer", sender_name: "고객", text: "요청사항.pdf", type: "unknown", is_from_me: false, timestamp: new Date().toISOString() };
  assert.equal(normalizeAttachmentMessage(base).type, "file");
  assert.equal(normalizeAttachmentMessage({ ...base, type: "text" }).type, "text");
  assert.equal(normalizeAttachmentMessage({ ...base, type: "photo", text: "", attachment: { name: "자료.bin", url: "https://example.invalid/a" } }).type, "file");
  const payloads = { "/document.pdf": Buffer.from("%PDF-1.4\n%%EOF\n"), "/notes.txt": Buffer.from("일정과 전달 사항\n", "utf8") };
  const server = createServer((req, res) => {
    const payload = payloads[req.url as keyof typeof payloads];
    res.writeHead(payload ? 200 : 404); res.end(payload);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const tasks = Object.entries(payloads).map(([name, bytes]) => ({ url: `http://127.0.0.1:${address.port}${name}`, filePath: path.join(directory, name.slice(1)), expectedSize: bytes.length }));
    const downloaded = await downloadAttachmentTasks(tasks);
    assert.equal(downloaded.savedPaths.length, 2); assert.equal(downloaded.errors.length, 0);
    tasks.forEach((task, i) => assert.deepEqual(readFileSync(task.filePath), Object.values(payloads)[i]));
    store.upsertMessages([base]);
    // 과거 버전의 downloads 기록만 있고 메시지 캐시 경로는 비어 있는 상태를 재현한다.
    db.prepare("INSERT INTO downloads VALUES (?, ?, ?, '', 1, ?)").run(base.id, base.chat_id, tasks[0].filePath, new Date().toISOString());
    assert.equal(store.getCachedMessages(base.chat_id)[0].localFilePath, tasks[0].filePath);
    assert.equal(store.getCachedMessagePage(base.chat_id).messages[0].localFilePath, tasks[0].filePath);
    assert.equal(store.getCachedMessageContext(base.chat_id, base.id)[0].localFilePath, tasks[0].filePath);
    assert.equal(store.getCachedMessages("manual_other").length, 0);
    const txt = { ...base, id: "1234567890123456790", text: "전달사항.txt" };
    store.upsertMessages([txt]);
    store.recordDownload({ messageId: txt.id, chatId: txt.chat_id, filePath: tasks[1].filePath, url: tasks[1].url, size: tasks[1].expectedSize });
    assert.equal((db.prepare("SELECT local_file_path FROM messages WHERE id = ?").get(txt.id) as { local_file_path: string }).local_file_path, tasks[1].filePath);
    store.upsertMessages([txt]);
    assert.equal(store.getCachedMessages(txt.chat_id).find((m) => m.id === txt.id)?.localFilePath, tasks[1].filePath);
    assert.equal(mergeExportMessages([{ ...base, localFilePath: tasks[0].filePath }], [base])[0].localFilePath, tasks[0].filePath);
    const owner = team.createTeamUser({ username: "owner", displayName: "관리자", role: "admin" }, null, true);
    const token = team.createSession(owner.user.id);
    const route = await import("../app/api/messages/export/route");
    for (const scope of ["recent", "all"]) {
      const response = await route.GET(new NextRequest(`http://localhost/api/messages/export?chatId=${base.chat_id}&scope=${scope}`, { headers: { cookie: `${team.SESSION_COOKIE}=${token}` } }));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.messages.length, 2);
      assert.ok(data.messages.every((m: Message) => m.type === "file" && m.localFilePath));
    }
    writeFileSync(path.join(directory, "verified.txt"), "PASS\n");
    console.log("PASS: PDF·TXT HTTP 다운로드와 바이트 일치, 파일 분류, 과거 다운로드 기록 보정, 완료 즉시 캐시 반영, 2일·전체 복사 및 덮어쓰기 회귀 검증");
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
