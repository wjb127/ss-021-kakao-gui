// kakaocli 외부 명령 실행 래퍼
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import type { Chat, Message, MessageAttachment } from "./types";
import { getDownloadsForChat } from "./store";

const execFileAsync = promisify(execFile);

const KAKAOCLI_BIN = process.env.KAKAOCLI_BIN || "kakaocli";
const DB = process.env.KAKAOCLI_DB || "";
const KEY = process.env.KAKAOCLI_KEY || "";

// JSON 파서 - id 같은 큰 정수가 정밀도 손실 나지 않도록 string 으로 변환
// kakaocli는 number로 출력하지만, JS Number는 53bit 까지만 안전.
// 임시 처리: regex 로 큰 정수 필드를 string 으로 감싼 뒤 JSON.parse
function parseSafeJson(raw: string): unknown {
  // id, chat_id, sender_id 등 숫자 필드를 문자열로 감쌈
  const wrapped = raw.replace(
    /("(?:id|chat_id|sender_id)"\s*:\s*)(\d{16,})/g,
    '$1"$2"',
  );
  return JSON.parse(wrapped);
}

export async function listChats(limit = 200): Promise<Chat[]> {
  if (!DB || !KEY) {
    console.error("KAKAOCLI_DB / KAKAOCLI_KEY 환경변수가 설정되지 않음");
    return [];
  }
  try {
    const { stdout } = await execFileAsync(
      KAKAOCLI_BIN,
      [
        "chats",
        "--json",
        "--limit",
        String(limit),
        "--db",
        DB,
        "--key",
        KEY,
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );
    const data = parseSafeJson(stdout) as Array<{
      id: string | number;
      display_name: string;
      member_count: number;
      unread_count: number;
      last_message_at: string;
      type?: string;
    }>;
    return data.map((c) => ({
      id: String(c.id),
      display_name: c.display_name,
      member_count: c.member_count,
      unread_count: c.unread_count,
      last_message_at: c.last_message_at,
      type: c.type,
      category: null,
    }));
  } catch (err) {
    console.error("kakaocli chats 실패:", err);
    return [];
  }
}

interface MediaMeta {
  attachment?: MessageAttachment;
  localFilePath?: string;
}

// kakao DB 에서 사진/동영상/파일 메시지의 attachment + localFilePath 조회
// chatId 는 숫자 문자열 (SQL injection 방지용 숫자 검증)
async function fetchMediaMeta(chatId: string): Promise<Map<string, MediaMeta>> {
  if (!/^\d+$/.test(chatId)) return new Map();
  const sql = `SELECT logId, attachment, localFilePath FROM NTChatMessage WHERE chatId=${chatId} AND type IN (2,3,18) AND (attachment IS NOT NULL OR (localFilePath IS NOT NULL AND localFilePath != ''))`;
  try {
    const { stdout } = await execFileAsync(
      KAKAOCLI_BIN,
      ["query", sql, "--db", DB, "--key", KEY],
      { maxBuffer: 50 * 1024 * 1024 },
    );
    const rows = parseSafeJson(stdout) as Array<
      [string | number, string | null, string | null]
    >;
    const map = new Map<string, MediaMeta>();
    for (const [logId, att, lfp] of rows) {
      let attachment: MessageAttachment | undefined;
      if (att) {
        try {
          attachment = JSON.parse(att) as MessageAttachment;
        } catch {
          attachment = undefined;
        }
      }
      map.set(String(logId), {
        attachment,
        localFilePath: lfp || undefined,
      });
    }
    return map;
  } catch (err) {
    console.error("fetchMediaMeta 실패:", err);
    return new Map();
  }
}

export async function listMessages(
  chatId: string,
  since = "10d",
  limit = 500,
): Promise<Message[]> {
  if (!DB || !KEY) {
    console.error("KAKAOCLI_DB / KAKAOCLI_KEY 환경변수가 설정되지 않음");
    return [];
  }
  try {
    const { stdout } = await execFileAsync(
      KAKAOCLI_BIN,
      [
        "messages",
        "--chat-id",
        chatId,
        "--since",
        since,
        "--limit",
        String(limit),
        "--json",
        "--db",
        DB,
        "--key",
        KEY,
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );
    const data = parseSafeJson(stdout) as Array<{
      id: string | number;
      chat_id: string | number;
      sender_id: string | number;
      text: string;
      is_from_me: boolean;
      timestamp: string;
      type: string;
    }>;
    // 미디어 메시지가 있을 때만 추가 쿼리 (불필요한 SQL 절약)
    const hasMedia = data.some(
      (m) => m.type === "photo" || m.type === "video" || m.type === "file",
    );
    const mediaMap = hasMedia ? await fetchMediaMeta(chatId) : new Map();
    // 인박스 자체 다운로드 경로 (downloads 테이블) — 카톡 앱 path 보다 우선
    const inboxDownloads = new Map<string, string>();
    if (hasMedia) {
      for (const d of getDownloadsForChat(chatId)) {
        if (existsSync(d.filePath)) inboxDownloads.set(d.messageId, d.filePath);
      }
    }
    return data.map((m) => {
      const meta = mediaMap.get(String(m.id));
      const inboxPath = inboxDownloads.get(String(m.id));
      const kakaoPath =
        meta?.localFilePath && existsSync(meta.localFilePath)
          ? meta.localFilePath
          : undefined;
      return {
        id: String(m.id),
        chat_id: String(m.chat_id),
        sender_id: String(m.sender_id),
        text: m.text ?? "",
        is_from_me: m.is_from_me,
        timestamp: m.timestamp,
        type: m.type,
        localFilePath: inboxPath ?? kakaoPath,
        attachment: meta?.attachment,
      };
    });
  } catch (err) {
    console.error("kakaocli messages 실패:", err);
    return [];
  }
}
