// 카톡 CDN URL 직접 다운로드 (인박스에서 자체 저장)
// HEAD 는 404 지만 GET 은 인증 없이 통과되는 점 활용
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDownload, recordDownload } from "@/lib/store";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DOWNLOAD_DIR = path.join(os.homedir(), "Downloads", "kakao-inbox");

interface AttachmentMeta {
  url?: string;
  thumbnailUrl?: string;
  s?: number;
  mt?: string;
  name?: string;
}

// kakaocli query 로 메시지 첨부 메타 + localFilePath 조회
async function fetchMessageMeta(
  chatId: string,
  messageId: string,
): Promise<{ attachment: AttachmentMeta | null; localFilePath: string | null }> {
  const KAKAOCLI_BIN = process.env.KAKAOCLI_BIN || "kakaocli";
  const DB = process.env.KAKAOCLI_DB || "";
  const KEY = process.env.KAKAOCLI_KEY || "";
  if (!DB || !KEY) throw new Error("KAKAOCLI_DB / KEY 미설정");
  if (!/^\d+$/.test(chatId) || !/^\d+$/.test(messageId)) {
    throw new Error("chatId / messageId 형식 오류");
  }
  const sql = `SELECT attachment, localFilePath FROM NTChatMessage WHERE chatId=${chatId} AND logId=${messageId} LIMIT 1`;
  const { stdout } = await execFileAsync(
    KAKAOCLI_BIN,
    ["query", sql, "--db", DB, "--key", KEY],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const rows = JSON.parse(stdout) as Array<[string | null, string | null]>;
  if (rows.length === 0) {
    throw new Error("메시지를 찾을 수 없음");
  }
  const [att, lfp] = rows[0];
  let attachment: AttachmentMeta | null = null;
  if (att) {
    try {
      attachment = JSON.parse(att) as AttachmentMeta;
    } catch {
      attachment = null;
    }
  }
  return { attachment, localFilePath: lfp || null };
}

// MIME → 확장자 추정
function extFromMime(mt?: string): string {
  if (!mt) return "bin";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  return map[mt.toLowerCase()] ?? mt.split("/")[1] ?? "bin";
}

function buildFileName(
  messageId: string,
  meta: AttachmentMeta,
): string {
  if (meta.name) return meta.name;
  const ext = extFromMime(meta.mt);
  return `kakao_${messageId}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chatId?: string;
      messageId?: string;
      force?: boolean;
    };
    const { chatId, messageId, force } = body;
    if (!chatId || !messageId) {
      return NextResponse.json(
        { error: "chatId, messageId 필요" },
        { status: 400 },
      );
    }

    // 이미 인박스에서 다운받았으면 그 경로 반환 (force=true 면 재다운)
    if (!force) {
      const cached = getDownload(messageId);
      if (cached && existsSync(cached.filePath)) {
        return NextResponse.json({
          path: cached.filePath,
          cached: true,
        });
      }
    }

    const meta = await fetchMessageMeta(chatId, messageId);

    // 카톡 앱에서 이미 다운받은 경우 그 경로 우선
    if (!force && meta.localFilePath && existsSync(meta.localFilePath)) {
      return NextResponse.json({
        path: meta.localFilePath,
        source: "kakao-app",
      });
    }

    if (!meta.attachment?.url) {
      return NextResponse.json(
        { error: "다운로드 URL 없음" },
        { status: 400 },
      );
    }

    // CDN 에서 GET 으로 받기 (HEAD 는 404 지만 GET 통과)
    const res = await fetch(meta.attachment.url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `CDN 응답 ${res.status}` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // 사이즈 검증 (DB 에 기록된 s 와 비교)
    if (meta.attachment.s && buf.length !== meta.attachment.s) {
      console.warn(
        `download size mismatch: expected ${meta.attachment.s}, got ${buf.length}`,
      );
    }

    // ~/Downloads/kakao-inbox/<chatId>/<filename>
    const chatDir = path.join(DOWNLOAD_DIR, chatId);
    mkdirSync(chatDir, { recursive: true });
    const fileName = buildFileName(messageId, meta.attachment);
    const filePath = path.join(chatDir, fileName);
    writeFileSync(filePath, buf);

    recordDownload({
      messageId,
      chatId,
      filePath,
      url: meta.attachment.url,
      size: buf.length,
    });

    return NextResponse.json({
      path: filePath,
      size: buf.length,
      source: "cdn",
    });
  } catch (err) {
    console.error("download-attachment 실패:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
