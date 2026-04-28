// SQLite 연결 및 스키마 초기화
import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import { mkdirSync } from "node:fs";

const DATA_DIR = path.join(os.homedir(), ".kakaocli");
const DB_PATH = path.join(DATA_DIR, "kakao-gui.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      chat_id TEXT PRIMARY KEY,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyses (
      chat_id     TEXT PRIMARY KEY,
      summary     TEXT NOT NULL,
      urgency     TEXT NOT NULL,
      todos       TEXT NOT NULL,
      next_action TEXT NOT NULL,
      analyzed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      chat_id     TEXT NOT NULL,
      sender_id   TEXT NOT NULL,
      text        TEXT NOT NULL,
      is_from_me  INTEGER NOT NULL,
      timestamp   TEXT NOT NULL,
      type        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id
      ON messages(chat_id);

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp
      ON messages(chat_id, timestamp);

    CREATE TABLE IF NOT EXISTS manual_chats (
      id            TEXT PRIMARY KEY,
      display_name  TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      last_message_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memos (
      chat_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_paths (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id      TEXT NOT NULL,
      project_path TEXT NOT NULL,
      UNIQUE(chat_id, project_path)
    );
  `);

  return _db;
}
