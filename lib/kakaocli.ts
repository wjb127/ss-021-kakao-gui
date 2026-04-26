// kakaocli 외부 명령 실행 래퍼
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Chat, Message } from "./types";

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
    return data.map((m) => ({
      id: String(m.id),
      chat_id: String(m.chat_id),
      sender_id: String(m.sender_id),
      text: m.text ?? "",
      is_from_me: m.is_from_me,
      timestamp: m.timestamp,
      type: m.type,
    }));
  } catch (err) {
    console.error("kakaocli messages 실패:", err);
    return [];
  }
}
