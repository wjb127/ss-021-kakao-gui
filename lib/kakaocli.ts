// kakaocli 외부 명령 실행 래퍼
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import bplistParser from "bplist-parser";
import type { Chat, Message, MessageAttachment } from "./types";
import { getDownloadsForChat } from "./store";
import { formatCallEvent, normalizeKakaoEvents } from "./kakao-events";

const execFileAsync = promisify(execFile);
const CHAT_CACHE_TTL_MS = 15_000;

interface ChatCacheState {
  data: Chat[];
  requestedLimit: number;
  expiresAt: number;
  pending: Promise<Chat[]> | null;
}

const CHAT_CACHE_KEY = "__kakaoInboxChatCache__";
type GlobalWithChatCache = {
  [CHAT_CACHE_KEY]?: ChatCacheState;
};

function getChatCache(): ChatCacheState {
  const global = globalThis as GlobalWithChatCache;
  if (!global[CHAT_CACHE_KEY]) {
    global[CHAT_CACHE_KEY] = {
      data: [],
      requestedLimit: 0,
      expiresAt: 0,
      pending: null,
    };
  }
  return global[CHAT_CACHE_KEY];
}

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

function redactCommandSecrets(text: string): string {
  return text.replace(/--key\s+\S+/g, "--key [redacted]");
}

function formatKakaoCliError(err: unknown): string {
  if (err instanceof Error) {
    return redactCommandSecrets(err.stack ?? err.message);
  }
  return redactCommandSecrets(String(err));
}

function isMissingDisplayName(name: string | null | undefined, id: string): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed === "(unknown)" || trimmed === id || /^\d{6,}$/.test(trimmed);
}

async function runQuery(sql: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    KAKAOCLI_BIN,
    ["query", sql, "--db", DB, "--key", KEY],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  return parseSafeJson(stdout);
}

async function fetchUserDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return new Map();

  const sql = `SELECT CAST(userId AS TEXT), COALESCE(NULLIF(TRIM(friendNickName), ''), NULLIF(TRIM(displayName), ''), NULLIF(TRIM(nickName), '')) FROM NTUser WHERE userId IN (${ids.join(",")})`;
  let rows: Array<[string | number, string | null]>;
  try {
    rows = (await runQuery(sql)) as Array<[string | number, string | null]>;
  } catch (err) {
    console.error("사용자 이름 조회 실패:", formatKakaoCliError(err));
    return new Map();
  }
  const names = new Map<string, string>();
  for (const [userId, name] of rows) {
    const trimmed = name?.trim();
    if (trimmed) names.set(String(userId), trimmed);
  }
  return names;
}

function parseMemberIds(hex: string | null): string[] {
  if (!hex) return [];
  try {
    const [value] = bplistParser.parseBuffer<unknown>(Buffer.from(hex, "hex"));
    if (!Array.isArray(value)) return [];
    return value.map(String).filter((id) => /^\d+$/.test(id));
  } catch {
    return [];
  }
}

async function fetchChatDisplayNames(chatIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(chatIds)].filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return new Map();

  const sql = `SELECT CAST(r.chatId AS TEXT), r.type, COALESCE(TRIM(r.chatName), ''), COALESCE((SELECT TRIM(o.linkName) FROM NTOpenLink o WHERE o.linkId = r.linkId LIMIT 1), ''), COALESCE((SELECT COALESCE(NULLIF(TRIM(u.friendNickName), ''), NULLIF(TRIM(u.displayName), ''), NULLIF(TRIM(u.nickName), '')) FROM NTUser u WHERE u.directChatId = r.chatId LIMIT 1), ''), hex(r.displayMemberIds) FROM NTChatRoom r WHERE r.chatId IN (${ids.join(",")})`;
  let rows: Array<
    [string | number, number, string, string, string, string | null]
  >;
  try {
    rows = (await runQuery(sql)) as Array<
      [string | number, number, string, string, string, string | null]
    >;
  } catch (err) {
    console.error("채팅방 이름 조회 실패:", formatKakaoCliError(err));
    return new Map();
  }
  const roomMemberIds = new Map<string, string[]>();
  const allMemberIds: string[] = [];

  for (const [chatIdValue, , , , , memberIdsHex] of rows) {
    const chatId = String(chatIdValue);
    const memberIds = parseMemberIds(memberIdsHex);
    roomMemberIds.set(chatId, memberIds);
    allMemberIds.push(...memberIds);
  }

  const userNames = await fetchUserDisplayNames(allMemberIds);
  const names = new Map<string, string>();
  for (const [chatIdValue, roomType, chatName, openLinkName, directName] of rows) {
    const chatId = String(chatIdValue);
    if (chatName) {
      names.set(chatId, chatName);
      continue;
    }
    if (openLinkName) {
      names.set(chatId, openLinkName);
      continue;
    }
    if (roomType === 5) {
      names.set(chatId, "나와의 채팅");
      continue;
    }
    if (directName) {
      names.set(chatId, directName);
      continue;
    }

    const memberNames = (roomMemberIds.get(chatId) ?? [])
      .map((memberId) => userNames.get(memberId))
      .filter((name): name is string => !!name);
    if (memberNames.length > 0) names.set(chatId, memberNames.join(", "));
  }
  return names;
}

export async function listChats(limit = 200): Promise<Chat[]> {
  const cache = getChatCache();
  if (cache.expiresAt > Date.now() && cache.requestedLimit >= limit) {
    return cache.data.slice(0, limit);
  }
  if (cache.pending) {
    const pending = await cache.pending;
    if (cache.requestedLimit >= limit) return pending.slice(0, limit);
  }
  if (!DB || !KEY) {
    console.error("KAKAOCLI_DB / KAKAOCLI_KEY 환경변수가 설정되지 않음");
    return [];
  }
  const request = (async (): Promise<Chat[]> => {
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
      const missingNameIds = data
        .map((c) => String(c.id))
        .filter((id, index) =>
          isMissingDisplayName(data[index].display_name, id),
        );
      const fallbackNames = await fetchChatDisplayNames(missingNameIds);

      return data.map((c) => {
        const id = String(c.id);
        return {
          id,
          display_name: isMissingDisplayName(c.display_name, id)
            ? fallbackNames.get(id) ?? c.display_name ?? "(unknown)"
            : c.display_name,
          member_count: c.member_count,
          unread_count: c.unread_count,
          last_message_at: c.last_message_at,
          type: c.type,
          category: null,
        };
      });
    } catch (err) {
      console.error("kakaocli chats 실패:", formatKakaoCliError(err));
      return [];
    }
  })();
  cache.pending = request;
  try {
    const chats = await request;
    cache.data = chats;
    cache.requestedLimit = limit;
    cache.expiresAt = Date.now() + CHAT_CACHE_TTL_MS;
    return chats;
  } finally {
    cache.pending = null;
  }
}

interface MediaMeta {
  attachment?: MessageAttachment;
  localFilePath?: string;
}

function isMultiPhotoText(text: string): boolean {
  return /사진\s*\d+\s*장|写真\s*\d+\s*枚|n\s+photos/i.test(text);
}

function hasDownloadableAttachment(attachment?: MessageAttachment): boolean {
  return !!(
    attachment?.url ||
    (Array.isArray(attachment?.imageUrls) && attachment.imageUrls.length > 0)
  );
}

interface SpecialMessageMeta {
  type?: string;
  text?: string;
  reply?: Message["reply"];
}

interface SpecialMessages {
  events: Message[];
  overlays: Map<string, SpecialMessageMeta>;
}

function parseEmbeddedJson<T>(text: string): T | null {
  try {
    const lossless = text.replace(
      /("(?:logId|userId|src_logId|src_userId|src_linkId|threadId)"\s*:\s*)(\d{16,})/g,
      '$1"$2"',
    );
    return JSON.parse(lossless) as T;
  } catch {
    return null;
  }
}

async function fetchSpecialMessages(
  chatId: string,
  sinceTimestamp: string,
): Promise<SpecialMessages> {
  const empty: SpecialMessages = { events: [], overlays: new Map() };
  if (!/^\d+$/.test(chatId)) return empty;
  const sinceSeconds = Math.max(
    0,
    Math.floor(new Date(sinceTimestamp).getTime() / 1000),
  );
  if (!Number.isFinite(sinceSeconds)) return empty;

  const sql = `SELECT CAST(logId AS TEXT), CAST(authorId AS TEXT), type, COALESCE(message, ''), COALESCE(attachment, ''), sentAt FROM NTChatMessage WHERE chatId=${chatId} AND sentAt>=${sinceSeconds} AND type IN (0,26,51,52,16435,16436) ORDER BY sentAt`;
  try {
    const rows = (await runQuery(sql)) as Array<
      [string | number, string | number, number, string, string, number]
    >;
    const myUserId = process.env.KAKAOCLI_USER_ID ?? "";
    const replyPayloads = rows
      .filter(([, , type]) => type === 26)
      .map(([, , , , attachment]) =>
        parseEmbeddedJson<{
          src_logId?: string | number;
          src_userId?: string | number;
          src_message?: string;
          src_type?: number;
        }>(attachment),
      )
      .filter((payload): payload is NonNullable<typeof payload> => !!payload);
    const replySenderNames = await fetchUserDisplayNames(
      replyPayloads.map((payload) => String(payload.src_userId ?? "")),
    );
    const events: Message[] = [];
    const overlays = new Map<string, SpecialMessageMeta>();

    for (const [logIdValue, authorIdValue, rawType, text, attachment, sentAt] of rows) {
      const logId = String(logIdValue);
      const authorId = String(authorIdValue);
      if (rawType === 0) {
        events.push({
          id: logId,
          chat_id: chatId,
          sender_id: authorId,
          text,
          is_from_me: authorId === myUserId,
          timestamp: new Date(sentAt * 1000).toISOString(),
          type: "system",
        });
        continue;
      }
      if (rawType === 26) {
        const payload = parseEmbeddedJson<{
          src_logId?: string | number;
          src_userId?: string | number;
          src_message?: string;
          src_type?: number;
        }>(attachment);
        if (!payload) continue;
        const senderId = String(payload.src_userId ?? "");
        overlays.set(logId, {
          type: "reply",
          reply: {
            messageId: String(payload.src_logId ?? ""),
            senderId,
            senderName: replySenderNames.get(senderId),
            text: payload.src_message ?? "",
            type: Number(payload.src_type ?? 1),
          },
        });
        continue;
      }

      const originalType = rawType >= 16384 ? rawType - 16384 : rawType;
      if (originalType === 51 || originalType === 52) {
        overlays.set(logId, {
          type: "system",
          text: formatCallEvent(originalType, text),
        });
      }
    }
    return { events, overlays };
  } catch (err) {
    console.error("특수 메시지 조회 실패:", formatKakaoCliError(err));
    return empty;
  }
}

// kakao DB 에서 사진/동영상/파일 메시지의 attachment + localFilePath 조회
// chatId 는 숫자 문자열 (SQL injection 방지용 숫자 검증)
async function fetchMediaMeta(
  chatId: string,
  messageIds: string[],
): Promise<Map<string, MediaMeta>> {
  if (!/^\d+$/.test(chatId)) return new Map();
  const ids = [...new Set(messageIds)].filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return new Map();
  const sql = `SELECT CAST(logId AS TEXT), attachment, localFilePath FROM NTChatMessage WHERE chatId=${chatId} AND logId IN (${ids.join(",")}) AND type IN (2,3,18,27,16386,16411) AND (attachment IS NOT NULL OR (localFilePath IS NOT NULL AND localFilePath != ''))`;
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
    console.error("fetchMediaMeta 실패:", formatKakaoCliError(err));
    return new Map();
  }
}

export async function enrichCachedMessages(
  chatId: string,
  messages: Message[],
): Promise<Message[]> {
  if (messages.length === 0 || !/^\d+$/.test(chatId)) return messages;
  const senderNames = await fetchUserDisplayNames(
    messages
      .filter((message) => !message.is_from_me && !message.sender_name)
      .map((message) => message.sender_id),
  );
  const mediaMessages = messages.filter((message) =>
    (message.type === "photo" ||
      message.type === "video" ||
      message.type === "file") &&
    !message.attachment,
  );
  const mediaMap = await fetchMediaMeta(
    chatId,
    mediaMessages.map((message) => message.id),
  );
  const inboxDownloads = new Map<string, string>();
  for (const download of getDownloadsForChat(chatId)) {
    if (existsSync(download.filePath)) {
      inboxDownloads.set(download.messageId, download.filePath);
    }
  }

  return messages.map((message) => {
    const meta = mediaMap.get(message.id);
    const kakaoPath = meta?.localFilePath && existsSync(meta.localFilePath)
      ? meta.localFilePath
      : undefined;
    return {
      ...message,
      sender_name: message.sender_name ?? senderNames.get(message.sender_id),
      attachment: message.attachment ?? meta?.attachment,
      localFilePath:
        message.localFilePath ?? inboxDownloads.get(message.id) ?? kakaoPath,
    };
  });
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
    const senderNames = await fetchUserDisplayNames(
      data.filter((m) => !m.is_from_me).map((m) => String(m.sender_id)),
    );
    // 미디어 메시지가 있을 때만 추가 쿼리 (불필요한 SQL 절약)
    const hasMedia = data.some(
      (m) =>
        m.type === "photo" ||
        m.type === "video" ||
        m.type === "file" ||
        isMultiPhotoText(m.text ?? ""),
    );
    const mediaMap = hasMedia
      ? await fetchMediaMeta(
          chatId,
          data.filter((message) =>
            message.type === "photo" ||
            message.type === "video" ||
            message.type === "file" ||
            isMultiPhotoText(message.text ?? ""),
          ).map((message) => String(message.id)),
        )
      : new Map();
    // 인박스 자체 다운로드 경로 (downloads 테이블) — 카톡 앱 path 보다 우선
    const inboxDownloads = new Map<string, string>();
    if (hasMedia) {
      for (const d of getDownloadsForChat(chatId)) {
        if (existsSync(d.filePath)) inboxDownloads.set(d.messageId, d.filePath);
      }
    }
    const oldestTimestamp = data.reduce(
      (oldest, message) =>
        message.timestamp < oldest ? message.timestamp : oldest,
      data[0]?.timestamp ?? new Date().toISOString(),
    );
    const special = data.length > 0
      ? await fetchSpecialMessages(chatId, oldestTimestamp)
      : { events: [], overlays: new Map<string, SpecialMessageMeta>() };
    const messages: Message[] = data.map((m) => {
      const meta = mediaMap.get(String(m.id));
      const specialMeta = special.overlays.get(String(m.id));
      const inboxPath = inboxDownloads.get(String(m.id));
      const kakaoPath =
        meta?.localFilePath && existsSync(meta.localFilePath)
          ? meta.localFilePath
          : undefined;
      return {
        id: String(m.id),
        chat_id: String(m.chat_id),
        sender_id: String(m.sender_id),
        sender_name: senderNames.get(String(m.sender_id)),
        text: specialMeta?.text ?? m.text ?? "",
        is_from_me: m.is_from_me,
        timestamp: m.timestamp,
        type: specialMeta?.type ?? (
          m.type === "unknown" && hasDownloadableAttachment(meta?.attachment)
            ? "photo"
            : m.type
        ),
        reply: specialMeta?.reply,
        localFilePath: inboxPath ?? kakaoPath,
        attachment: meta?.attachment,
      };
    });
    const merged = new Map<string, Message>(
      messages.map((message) => [message.id, message]),
    );
    for (const event of special.events) merged.set(event.id, event);
    return normalizeKakaoEvents([...merged.values()]);
  } catch (err) {
    console.error("kakaocli messages 실패:", formatKakaoCliError(err));
    return [];
  }
}
