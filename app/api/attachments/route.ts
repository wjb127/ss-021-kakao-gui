import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { authError, withTeamApi } from "@/lib/team-auth";
import { getDb } from "@/lib/db";
import { getDownload } from "@/lib/store";

export const GET = withTeamApi(async (req) => {
  const chatId = req.nextUrl.searchParams.get("chatId")!;
  const messageId = req.nextUrl.searchParams.get("messageId");
  const index = Number(req.nextUrl.searchParams.get("index") ?? "0");
  if (!messageId || !Number.isInteger(index) || index < 0) return authError("첨부파일을 확인해 주세요.", 400);
  const downloaded = getDownload(messageId);
  const cached = getDb().prepare("SELECT local_file_path FROM messages WHERE id = ? AND chat_id = ?").get(messageId, chatId) as { local_file_path: string | null } | undefined;
  let filePath = downloaded?.chatId === chatId ? downloaded.filePath : cached?.local_file_path;
  if (!filePath) return authError("먼저 첨부파일을 다운로드해 주세요.", 404);
  try {
    let info = await lstat(filePath);
    if (info.isSymbolicLink()) return authError("이 첨부파일은 열 수 없어요.", 403);
    if (info.isDirectory()) {
      const files = (await readdir(filePath, { withFileTypes: true })).filter((file) => file.isFile()).map((file) => file.name).sort();
      if (!files[index]) return authError("첨부파일을 찾을 수 없어요.", 404);
      filePath = path.join(filePath, files[index]);
      info = await lstat(filePath);
    } else if (index !== 0) return authError("첨부파일을 찾을 수 없어요.", 404);
    if (!info.isFile() || info.isSymbolicLink()) return authError("첨부파일을 찾을 수 없어요.", 404);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath)).replace(/'/g, "%27")}`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return authError("첨부파일을 찾을 수 없어요. 다시 다운로드해 주세요.", 404); }
}, "chat");
