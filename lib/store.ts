// SQLite 기반 저장소 (better-sqlite3, 동기 API를 async로 래핑)
import { getDb } from "./db";
import type { Analysis, CategoriesFile, Category, Urgency } from "./types";

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
