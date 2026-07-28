// SQLite 기반 저장소 (better-sqlite3, 동기 API를 async로 래핑)
import { getDb } from "./db";
import type {
  Analysis,
  CategoriesFile,
  Category,
  ClientRequest,
  Message,
  MessageCursor,
  MessagePage,
  RequestKind,
  RequestStatus,
  Urgency,
} from "./types";

interface CategoryRow {
  chat_id: string;
  category: Category;
}

interface AnalysisRow {
  chat_id: string;
  summary: string;
  urgency: string;
  todos: string;
  next_action: string;
  analyzed_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  is_from_me: number;
  timestamp: string;
  type: string;
  is_edited: number;
  reply_message_id: string | null;
  reply_sender_id: string | null;
  reply_sender_name: string | null;
  reply_text: string | null;
  reply_type: number | null;
}

// ─── categories ──────────────────────────────────────────────────────────────

export async function getCategories(): Promise<CategoriesFile> {
  const db = getDb();
  const rows = db.prepare("SELECT chat_id, category FROM categories").all() as CategoryRow[];
  return Object.fromEntries(rows.map((r) => [r.chat_id, r.category]));
}

export async function setCategory(
  chatId: string,
  category: Category | null,
): Promise<void> {
  const db = getDb();
  if (category === null) {
    db.prepare("DELETE FROM categories WHERE chat_id = ?").run(chatId);
  } else {
    db.prepare(
      "INSERT OR REPLACE INTO categories (chat_id, category) VALUES (?, ?)",
    ).run(chatId, category);
  }
}

// ─── analyses ────────────────────────────────────────────────────────────────

export async function getTodoForChat(chatId: string): Promise<Analysis | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM analyses WHERE chat_id = ?")
    .get(chatId) as AnalysisRow | undefined;
  if (!row) return null;

  const urgency: Urgency =
    row.urgency === "Critical" ||
    row.urgency === "High" ||
    row.urgency === "Medium" ||
    row.urgency === "Low"
      ? (row.urgency as Urgency)
      : "Medium";

  return {
    summary: row.summary,
    urgency,
    todos: JSON.parse(row.todos) as string[],
    nextAction: row.next_action,
    analyzedAt: row.analyzed_at,
  };
}

export async function setTodoForChat(
  chatId: string,
  analysis: Analysis,
): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO analyses
     (chat_id, summary, urgency, todos, next_action, analyzed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    chatId,
    analysis.summary,
    analysis.urgency,
    JSON.stringify(analysis.todos),
    analysis.nextAction,
    analysis.analyzedAt,
  );
}

// ─── manual_chats ────────────────────────────────────────────────────────────

interface ManualChatRow {
  id: string;
  display_name: string;
  created_at: string;
  last_message_at: string;
}

export function getManualChats(): ManualChatRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM manual_chats ORDER BY last_message_at DESC").all() as ManualChatRow[];
}

export function createManualChat(displayName: string): string {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `manual_${Date.now()}`;
  db.prepare(
    "INSERT INTO manual_chats (id, display_name, created_at, last_message_at) VALUES (?, ?, ?, ?)",
  ).run(id, displayName, now, now);
  return id;
}

export function deleteManualChat(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM manual_chats WHERE id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(id);
}

export function updateManualChatLastMessage(id: string, timestamp: string): void {
  const db = getDb();
  db.prepare("UPDATE manual_chats SET last_message_at = ? WHERE id = ?").run(timestamp, id);
}

// ─── memos ───────────────────────────────────────────────────────────────────

export function getMemo(chatId: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT content FROM memos WHERE chat_id = ?")
    .get(chatId) as { content: string } | undefined;
  return row?.content ?? "";
}

export function setMemo(chatId: string, content: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO memos (chat_id, content, updated_at)
     VALUES (?, ?, ?)`,
  ).run(chatId, content, new Date().toISOString());
}

// ─── project_paths ───────────────────────────────────────────────────────────

export function getProjectPaths(chatId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT project_path FROM project_paths WHERE chat_id = ? ORDER BY id ASC")
    .all(chatId) as { project_path: string }[];
  return rows.map((r) => r.project_path);
}

export function addProjectPath(chatId: string, projectPath: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO project_paths (chat_id, project_path) VALUES (?, ?)",
  ).run(chatId, projectPath.trim());
}

export function removeProjectPath(chatId: string, projectPath: string): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM project_paths WHERE chat_id = ? AND project_path = ?",
  ).run(chatId, projectPath);
}

// 하위 호환 — 단일 경로 조회 (save-context에서 사용)
export function getProjectPath(chatId: string): string | null {
  const paths = getProjectPaths(chatId);
  return paths[0] ?? null;
}

// ─── last_seen (폴링 워커용) ─────────────────────────────────────────────────

export function getLastSeen(chatId: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT timestamp FROM last_seen WHERE chat_id = ?")
    .get(chatId) as { timestamp: string } | undefined;
  return row?.timestamp ?? null;
}

export function setLastSeen(chatId: string, timestamp: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO last_seen (chat_id, timestamp) VALUES (?, ?)",
  ).run(chatId, timestamp);
}

export function getAllLastSeen(): Record<string, string> {
  const db = getDb();
  const rows = db
    .prepare("SELECT chat_id, timestamp FROM last_seen")
    .all() as { chat_id: string; timestamp: string }[];
  return Object.fromEntries(rows.map((r) => [r.chat_id, r.timestamp]));
}

// ─── app_settings (key-value) ────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
  ).run(key, value);
}

// ─── claude_runs ─────────────────────────────────────────────────────────────

export type RunStatus = "running" | "success" | "error" | "cancelled";

export interface ClaudeRun {
  id: string;
  chat_id: string;
  project_path: string;
  prompt: string;
  output: string;
  status: RunStatus;
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
}

interface ClaudeRunRow {
  id: string;
  chat_id: string;
  project_path: string;
  prompt: string;
  output: string;
  status: string;
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
}

function rowToRun(r: ClaudeRunRow): ClaudeRun {
  const status: RunStatus =
    r.status === "running" || r.status === "success" || r.status === "error"
      ? (r.status as RunStatus)
      : "error";
  return { ...r, status };
}

export function createClaudeRun(
  chatId: string,
  projectPath: string,
  prompt: string,
): string {
  const db = getDb();
  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    `INSERT INTO claude_runs (id, chat_id, project_path, prompt, status, started_at)
     VALUES (?, ?, ?, ?, 'running', ?)`,
  ).run(id, chatId, projectPath, prompt, new Date().toISOString());
  return id;
}

export function appendClaudeRunOutput(id: string, chunk: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE claude_runs SET output = output || ? WHERE id = ?",
  ).run(chunk, id);
}

export function finishClaudeRun(
  id: string,
  status: RunStatus,
  exitCode: number | null,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE claude_runs SET status = ?, exit_code = ?, finished_at = ? WHERE id = ?",
  ).run(status, exitCode, new Date().toISOString(), id);
}

// 서버 부팅 시 호출 — 'running'으로 남은 run은 전부 orphan이다.
// 자식 프로세스 레지스트리가 globalThis에 있어 프로세스가 죽으면
// finishClaudeRun을 호출할 주체가 사라지기 때문에 영원히 running으로 남는다.
export function reapOrphanRuns(): number {
  const db = getDb();
  const res = db
    .prepare(
      `UPDATE claude_runs
       SET status = 'error',
           finished_at = ?,
           output = output || ?
       WHERE status = 'running'`,
    )
    .run(
      new Date().toISOString(),
      "\n[orphan] 서버가 재시작되어 실행 결과를 확인할 수 없음 — error 처리\n",
    );
  return res.changes;
}

export function getClaudeRun(id: string): ClaudeRun | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM claude_runs WHERE id = ?")
    .get(id) as ClaudeRunRow | undefined;
  return row ? rowToRun(row) : null;
}

export function listClaudeRunsByChat(chatId: string, limit = 20): ClaudeRun[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM claude_runs WHERE chat_id = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(chatId, limit) as ClaudeRunRow[];
  return rows.map(rowToRun);
}

// ─── messages (캐시) ─────────────────────────────────────────────────────────

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    text: row.text,
    is_from_me: row.is_from_me === 1,
    timestamp: row.timestamp,
    type: row.type,
    is_edited: row.is_edited === 1,
    reply: row.reply_message_id
      ? {
          messageId: row.reply_message_id,
          senderId: row.reply_sender_id ?? "",
          senderName: row.reply_sender_name ?? undefined,
          text: row.reply_text ?? "",
          type: row.reply_type ?? 1,
        }
      : undefined,
  };
}

export function getCachedMessages(chatId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC",
    )
    .all(chatId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getCachedMessageCount(chatId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE chat_id = ?")
    .get(chatId) as { count: number };
  return row.count;
}

export function getCachedMessagePage(
  chatId: string,
  options?: { before?: MessageCursor | null; limit?: number },
): MessagePage {
  const db = getDb();
  const limit = Math.max(50, Math.min(options?.limit ?? 300, 500));
  const before = options?.before;
  const rows = before
    ? db.prepare(
        `SELECT * FROM messages
         WHERE chat_id = ?
           AND (timestamp < ? OR (timestamp = ? AND id < ?))
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
      ).all(
        chatId,
        before.timestamp,
        before.timestamp,
        before.id,
        limit + 1,
      ) as MessageRow[]
    : db.prepare(
        `SELECT * FROM messages
         WHERE chat_id = ?
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`,
      ).all(chatId, limit + 1) as MessageRow[];
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit).reverse();
  const first = pageRows[0];

  return {
    messages: pageRows.map(rowToMessage),
    hasMore,
    nextCursor:
      hasMore && first
        ? { timestamp: first.timestamp, id: first.id }
        : null,
    total: getCachedMessageCount(chatId),
  };
}

// 특정 채팅의 모든 메시지 삭제 (새로파싱 모드용)
export function deleteMessagesForChat(chatId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
}

export function deleteMessagesByIds(messageIds: string[]): void {
  const ids = [...new Set(messageIds)];
  if (ids.length === 0) return;
  const db = getDb();
  const remove = db.prepare("DELETE FROM messages WHERE id = ?");
  const removeMany = db.transaction((targetIds: string[]) => {
    for (const id of targetIds) remove.run(id);
  });
  removeMany(ids);
}

// ─── downloads (인박스 자체 다운로드 추적) ───────────────────────────────────

export interface DownloadRecord {
  messageId: string;
  chatId: string;
  filePath: string;
  url: string;
  size: number | null;
  downloadedAt: string;
}

interface DownloadRow {
  message_id: string;
  chat_id: string;
  file_path: string;
  url: string;
  size: number | null;
  downloaded_at: string;
}

function rowToDownload(r: DownloadRow): DownloadRecord {
  return {
    messageId: r.message_id,
    chatId: r.chat_id,
    filePath: r.file_path,
    url: r.url,
    size: r.size,
    downloadedAt: r.downloaded_at,
  };
}

export function recordDownload(rec: Omit<DownloadRecord, "downloadedAt">): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO downloads
     (message_id, chat_id, file_path, url, size, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    rec.messageId,
    rec.chatId,
    rec.filePath,
    rec.url,
    rec.size,
    new Date().toISOString(),
  );
}

export function getDownload(messageId: string): DownloadRecord | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM downloads WHERE message_id = ?")
    .get(messageId) as DownloadRow | undefined;
  return row ? rowToDownload(row) : null;
}

export function getDownloadsForChat(chatId: string): DownloadRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM downloads WHERE chat_id = ?")
    .all(chatId) as DownloadRow[];
  return rows.map(rowToDownload);
}

// ─── messages (캐시 헬퍼) ────────────────────────────────────────────────────

// 카카오 원본의 수정·삭제 이벤트 정규화가 캐시에도 반영되도록 갱신한다.
export function upsertMessages(messages: Message[]): void {
  if (messages.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO messages
     (id, chat_id, sender_id, text, is_from_me, timestamp, type, is_edited,
      reply_message_id, reply_sender_id, reply_sender_name, reply_text, reply_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       chat_id = excluded.chat_id,
       sender_id = excluded.sender_id,
       text = excluded.text,
       is_from_me = excluded.is_from_me,
       timestamp = excluded.timestamp,
       type = excluded.type,
       is_edited = excluded.is_edited,
       reply_message_id = excluded.reply_message_id,
       reply_sender_id = excluded.reply_sender_id,
       reply_sender_name = excluded.reply_sender_name,
       reply_text = excluded.reply_text,
       reply_type = excluded.reply_type`,
  );
  const insertMany = db.transaction((msgs: Message[]) => {
    for (const m of msgs) {
      insert.run(
        m.id,
        m.chat_id,
        m.sender_id,
        m.text,
        m.is_from_me ? 1 : 0,
        m.timestamp,
        m.type,
        m.is_edited ? 1 : 0,
        m.reply?.messageId ?? null,
        m.reply?.senderId ?? null,
        m.reply?.senderName ?? null,
        m.reply?.text ?? null,
        m.reply?.type ?? null,
      );
    }
  });
  insertMany(messages);
}

// ─── requests (고객 요청 자동 추출) ──────────────────────────────────────────

interface RequestRow {
  id: string;
  chat_id: string;
  source_msg_id: string | null;
  title: string;
  detail: string;
  kind: string;
  status: string;
  project_path: string | null;
  confidence: number | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
}

const REQUEST_KINDS: RequestKind[] = [
  "fix",
  "feature",
  "asset",
  "question",
  "payment",
  "info",
];
const REQUEST_STATUSES: RequestStatus[] = [
  "open",
  "in_progress",
  "done",
  "dismissed",
];

function rowToRequest(r: RequestRow): ClientRequest {
  return {
    id: r.id,
    chatId: r.chat_id,
    sourceMsgId: r.source_msg_id,
    title: r.title,
    detail: r.detail,
    kind: REQUEST_KINDS.includes(r.kind as RequestKind)
      ? (r.kind as RequestKind)
      : "info",
    status: REQUEST_STATUSES.includes(r.status as RequestStatus)
      ? (r.status as RequestStatus)
      : "open",
    projectPath: r.project_path,
    confidence: r.confidence,
    runId: r.run_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface NewRequest {
  chatId: string;
  sourceMsgId?: string | null;
  title: string;
  detail?: string;
  kind: RequestKind;
  confidence?: number | null;
}

// 새 요청 일괄 저장. 반환값은 실제 삽입 건수
export function insertRequests(reqs: NewRequest[]): number {
  if (reqs.length === 0) return 0;
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO requests
     (id, chat_id, source_msg_id, title, detail, kind, status, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
  );
  let inserted = 0;
  const run = db.transaction((items: NewRequest[]) => {
    for (const r of items) {
      const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      stmt.run(
        id,
        r.chatId,
        r.sourceMsgId ?? null,
        r.title,
        r.detail ?? "",
        r.kind,
        r.confidence ?? null,
        now,
        now,
      );
      inserted++;
    }
  });
  run(reqs);
  return inserted;
}

export function getOpenRequests(chatId: string): ClientRequest[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM requests WHERE chat_id = ? AND status = 'open' ORDER BY created_at ASC",
    )
    .all(chatId) as RequestRow[];
  return rows.map(rowToRequest);
}

export function listRequests(opts?: {
  status?: RequestStatus;
  chatId?: string;
  limit?: number;
}): ClientRequest[] {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts?.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.chatId) {
    where.push("chat_id = ?");
    params.push(opts.chatId);
  }
  const sql =
    "SELECT * FROM requests" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY created_at DESC LIMIT ?";
  params.push(opts?.limit ?? 300);
  const rows = db.prepare(sql).all(...params) as RequestRow[];
  return rows.map(rowToRequest);
}

export function updateRequestStatus(id: string, status: RequestStatus): boolean {
  const db = getDb();
  const res = db
    .prepare("UPDATE requests SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  return res.changes > 0;
}

export function setRequestProjectPath(id: string, projectPath: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE requests SET project_path = ?, updated_at = ? WHERE id = ?",
  ).run(projectPath, new Date().toISOString(), id);
}

// ─── extract_state (요청 추출 커서) ──────────────────────────────────────────

export interface ExtractState {
  lastMsgTs: string | null;
  lastExtractedAt: string;
}

export function getExtractState(chatId: string): ExtractState | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT last_msg_ts, last_extracted_at FROM extract_state WHERE chat_id = ?",
    )
    .get(chatId) as
    | { last_msg_ts: string | null; last_extracted_at: string }
    | undefined;
  if (!row) return null;
  return { lastMsgTs: row.last_msg_ts, lastExtractedAt: row.last_extracted_at };
}

export function setExtractState(chatId: string, lastMsgTs: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO extract_state (chat_id, last_msg_ts, last_extracted_at)
     VALUES (?, ?, ?)`,
  ).run(chatId, lastMsgTs, new Date().toISOString());
}

// ─── 일일 사용 카운터 (API 호출 상한용) ──────────────────────────────────────

function todayKey(prefix: string): string {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}:${day}`;
}

export function getDailyCount(prefix: string): number {
  const raw = getSetting(todayKey(prefix));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function incrementDailyCount(prefix: string): number {
  const next = getDailyCount(prefix) + 1;
  setSetting(todayKey(prefix), String(next));
  return next;
}
