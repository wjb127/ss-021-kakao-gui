import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { getDb } from "./db";
import type { Message } from "./types";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 2 * 1024 * 1024;
interface LongTextMeta { mt?: string; path?: string; s?: number; cs?: string }
export type LongTextRow = [string, string, string];

// 원본 DB의 메시지 ID는 문자열로 읽어 64비트 정밀도를 보존한다.
async function readLongTextRows(chatId: string): Promise<LongTextRow[]> {
  const { stdout } = await execFileAsync(process.env.KAKAOCLI_BIN || "kakaocli", [
    "query",
    // JSON에서 슬래시가 \/로 저장되는 경우도 있으므로 MIME 접두부로 찾는다.
    `SELECT CAST(logId AS TEXT), message, attachment FROM NTChatMessage WHERE chatId=${chatId} AND attachment LIKE '%longtext%'`,
    "--db", process.env.KAKAOCLI_DB || "", "--key", process.env.KAKAOCLI_KEY || "",
  ], { timeout: 10_000, maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout) as LongTextRow[];
}

export async function readLongTextBody(
  preview: string, meta: LongTextMeta, fetcher: typeof fetch, signal: AbortSignal,
): Promise<string> {
  if (meta.mt !== "longtext/plain" || !meta.path?.startsWith("/talkm/") ||
      !Number.isSafeInteger(meta.s) || meta.s! < 1 || meta.s! > MAX_BYTES) throw new Error("invalid metadata");
  const url = new URL(meta.path, "https://dn-m.talk.kakao.com");
  if (url.origin !== "https://dn-m.talk.kakao.com" || !url.pathname.startsWith("/talkm/")) throw new Error("invalid URL");
  // 메시지 안의 임의 URL이나 리다이렉트는 따라가지 않는다.
  const response = await fetcher(url, { signal, redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("download failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES || size > meta.s!) throw new Error("body too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  if (size !== meta.s) throw new Error("incomplete body");
  const body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  // 미리보기와 원문을 이어 붙이지 않아 중복 문단이 생기지 않는다.
  if (!body.startsWith(preview) || body.length < preview.length) throw new Error("body mismatch");
  return body;
}

export async function expandLongMessages(
  chatId: string, messages: Message[],
  options: { readRows?: (chatId: string) => Promise<LongTextRow[]>; fetcher?: typeof fetch } = {},
): Promise<Message[]> {
  if (!/^\d+$/.test(chatId) || messages.length === 0) return messages;
  const db = getDb();
  let rows: LongTextRow[];
  try { rows = await (options.readRows ?? readLongTextRows)(chatId); }
  catch { throw new Error("긴 메시지 원문을 확인하지 못했어요. 카카오톡 연결을 확인한 뒤 다시 복사해 주세요."); }
  const byId = new Map(rows.map((row) => [row[0], row]));
  const cached = db.prepare("SELECT source_hash, body FROM long_message_bodies WHERE chat_id=? AND message_id=?");
  const save = db.prepare(`INSERT INTO long_message_bodies (chat_id,message_id,source_hash,body) VALUES (?,?,?,?)
    ON CONFLICT(chat_id,message_id) DO UPDATE SET source_hash=excluded.source_hash,body=excluded.body`);
  const result = [...messages];
  const signal = AbortSignal.timeout(15_000);
  let index = 0;
  let failures = 0;
  await Promise.all(Array.from({ length: Math.min(4, messages.length) }, async () => {
    while (index < messages.length) {
      const i = index++;
      const message = messages[i];
      const row = byId.get(message.id);
      const saved = cached.get(chatId, message.id) as { source_hash: string; body: string } | undefined;
      if (!row) {
        // 삭제 등으로 원본 메타가 사라져도 이미 보관한 본문은 유지한다.
        if (saved && message.text && saved.body.startsWith(message.text)) result[i] = { ...message, text: saved.body };
        continue;
      }
      try {
        const meta = JSON.parse(row[2]) as LongTextMeta;
        const hash = createHash("sha256").update(JSON.stringify([row[1], meta])).digest("hex");
        const body = saved?.source_hash === hash ? saved.body
          : await readLongTextBody(row[1], meta, options.fetcher ?? fetch, signal);
        if (saved?.source_hash !== hash) save.run(chatId, message.id, hash, body);
        result[i] = { ...message, text: body };
      } catch { failures++; }
    }
  }));
  if (failures) throw new Error(`긴 메시지 ${failures}건의 원문을 가져오지 못해 복사를 중단했어요. 다시 시도해 주세요. 만료된 원문은 복구할 수 없을 수 있어요.`);
  return result;
}
