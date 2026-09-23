import { getDb } from "./db";
import { EMPTY_WORK, type ChatWork } from "./work-types";

function db() {
  const connection = getDb();
  connection.exec(`CREATE TABLE IF NOT EXISTS chat_work (
    chat_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
    document TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  return connection;
}
export function getChatWork(chatId: string): ChatWork {
  const row = db().prepare("SELECT revision, document FROM chat_work WHERE chat_id = ?").get(chatId) as { revision: number; document: string } | undefined;
  return row ? { ...JSON.parse(row.document), revision: row.revision } : { ...EMPTY_WORK, items: [] };
}
// 팀원이 동시에 저장하면 뒤늦은 요청으로 앞선 변경을 덮어쓰지 않는다.
export function saveChatWork(chatId: string, work: ChatWork) {
  const connection = db();
  return connection.transaction(() => {
    const current = getChatWork(chatId);
    if (current.revision !== work.revision) return false;
    connection.prepare(`INSERT INTO chat_work(chat_id, revision, document, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET revision = excluded.revision, document = excluded.document, updated_at = excluded.updated_at`)
      .run(chatId, work.revision + 1, JSON.stringify(work), new Date().toISOString());
    return true;
  })();
}
