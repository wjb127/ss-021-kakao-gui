// SQLite 기반 저장소 (better-sqlite3, 동기 API를 async로 래핑)
import { getDb } from "./db";
import type { Analysis, CategoriesFile, Category, Message, Urgency } from "./types";

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

export type RunStatus = "running" | "success" | "error";

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

// INSERT OR IGNORE: 이미 있는 id는 건너뜀 (중복 방지)
export function upsertMessages(messages: Message[]): void {
  if (messages.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO messages
     (id, chat_id, sender_id, text, is_from_me, timestamp, type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
      );
    }
  });
  insertMany(messages);
}
