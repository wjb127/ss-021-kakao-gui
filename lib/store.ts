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
