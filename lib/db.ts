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

    -- 폴링 워커가 마지막으로 본 메시지 timestamp 추적 (chat_id별)
    CREATE TABLE IF NOT EXISTS last_seen (
      chat_id   TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL
    );

    -- 앱 전역 설정 (ntfy 토픽, 활성화 여부 등)
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Claude Code 원격 실행 기록
    CREATE TABLE IF NOT EXISTS claude_runs (
      id           TEXT PRIMARY KEY,
      chat_id      TEXT NOT NULL,
      project_path TEXT NOT NULL,
      prompt       TEXT NOT NULL,
      output       TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL,           -- running | success | error
      exit_code    INTEGER,
      started_at   TEXT NOT NULL,
      finished_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_claude_runs_chat
      ON claude_runs(chat_id, started_at DESC);

    -- 인박스 자체 다운로드 추적 (kakaocli DB 의 localFilePath 와 별개)
    CREATE TABLE IF NOT EXISTS downloads (
      message_id    TEXT PRIMARY KEY,
      chat_id       TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      url           TEXT NOT NULL,
      size          INTEGER,
      downloaded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_chat
      ON downloads(chat_id);
  `);

  return _db;
}
