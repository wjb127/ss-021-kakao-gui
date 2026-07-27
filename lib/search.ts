// 앱 캐시 DB 전문 검색
//
// 주의: 검색 대상은 앱이 캐싱한 메시지뿐이다.
// 캐싱 조건은 member_count 1~10 (1:1/소규모 DM)이므로 대형 단톡방은 포함되지 않는다.
//
// LIKE 검색이라 인덱스를 타지 않는다. 35k행 규모에선 충분히 빠르지만
// 결과 상한을 두어 응답 크기를 제한한다.

import { getDb } from "./db";

const MAX_MESSAGES = 200;
const SNIPPET_PAD = 60;

export interface MessageHit {
  id: string;
  chatId: string;
  text: string;
  snippet: string;
  isFromMe: boolean;
  timestamp: string;
  type: string;
}

export interface MemoHit {
  chatId: string;
  snippet: string;
  updatedAt: string;
}

export interface RequestHit {
  id: string;
  chatId: string;
  title: string;
  kind: string;
  status: string;
  createdAt: string;
}

export interface SearchResult {
  query: string;
  error: string | null;
  messages: MessageHit[];
  memos: MemoHit[];
  requests: RequestHit[];
  truncated: boolean;
}

// 매칭 위치 주변만 잘라서 스니펫 생성
function makeSnippet(text: string, q: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const idx = flat.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return flat.slice(0, SNIPPET_PAD * 2);
  const start = Math.max(0, idx - SNIPPET_PAD);
  const end = Math.min(flat.length, idx + q.length + SNIPPET_PAD);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}

// LIKE 와일드카드 이스케이프 (사용자 입력의 % _ 를 리터럴로)
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function searchAll(
  q: string,
  opts?: { chatId?: string },
): SearchResult {
  const db = getDb();
  const like = `%${escapeLike(q)}%`;

  // ─── 메시지 ───
  const msgParams: (string | number)[] = [like];
  let msgSql = `SELECT id, chat_id, text, is_from_me, timestamp, type
                FROM messages
                WHERE text LIKE ? ESCAPE '\\'`;
  if (opts?.chatId) {
    msgSql += " AND chat_id = ?";
    msgParams.push(opts.chatId);
  }
  msgSql += " ORDER BY timestamp DESC LIMIT ?";
  msgParams.push(MAX_MESSAGES + 1);

  const msgRows = db.prepare(msgSql).all(...msgParams) as {
    id: string;
    chat_id: string;
    text: string;
    is_from_me: number;
    timestamp: string;
    type: string;
  }[];

  const truncated = msgRows.length > MAX_MESSAGES;
  const messages: MessageHit[] = msgRows.slice(0, MAX_MESSAGES).map((r) => ({
    id: r.id,
    chatId: r.chat_id,
    text: r.text,
    snippet: makeSnippet(r.text, q),
    isFromMe: r.is_from_me === 1,
    timestamp: r.timestamp,
    type: r.type,
  }));

  // ─── 메모 ───
  const memoRows = db
    .prepare(
      `SELECT chat_id, content, updated_at FROM memos
       WHERE content LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 50`,
    )
    .all(like) as { chat_id: string; content: string; updated_at: string }[];

  const memos: MemoHit[] = memoRows.map((r) => ({
    chatId: r.chat_id,
    snippet: makeSnippet(r.content, q),
    updatedAt: r.updated_at,
  }));

  // ─── 요청 ───
  const reqRows = db
    .prepare(
      `SELECT id, chat_id, title, kind, status, created_at FROM requests
       WHERE (title LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')
       ORDER BY created_at DESC LIMIT 50`,
    )
    .all(like, like) as {
    id: string;
    chat_id: string;
    title: string;
    kind: string;
    status: string;
    created_at: string;
  }[];

  const requests: RequestHit[] = reqRows.map((r) => ({
    id: r.id,
    chatId: r.chat_id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    createdAt: r.created_at,
  }));

  return { query: q, error: null, messages, memos, requests, truncated };
}
