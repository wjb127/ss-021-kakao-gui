import { getDb } from "./db";
import type { Chat } from "./types";
import type { BoardStage, BoardState, BoardOrderEntry } from "./board-types";

let schemaReady = false;

function db() {
  const connection = getDb();
  if (schemaReady) return connection;
  connection.exec(`CREATE TABLE IF NOT EXISTS chat_board (
    chat_id TEXT PRIMARY KEY, stage TEXT NOT NULL DEFAULT 'new',
    revision INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0,
    observed_at TEXT NOT NULL DEFAULT '', inbound_id TEXT NOT NULL DEFAULT ''
  )`);
  const columns = connection.prepare("PRAGMA table_info(chat_board)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "position")) connection.exec("ALTER TABLE chat_board ADD COLUMN position REAL NOT NULL DEFAULT 0");
  schemaReady = true;
  return connection;
}

// 실제 목록 조회 때만 관찰한다. 캐시 재생과 읽음 표시 유지로 단계를 되돌리지 않는다.
export function observeBoardChats(chats: Chat[], incomingIds: Map<string, string> = new Map()) {
  const connection = db();
  connection.transaction(() => {
    const read = connection.prepare("SELECT unread, observed_at, inbound_id FROM chat_board WHERE chat_id = ?");
    const insert = connection.prepare("INSERT OR IGNORE INTO chat_board(chat_id, unread, observed_at, inbound_id) VALUES (?, ?, ?, ?)");
    const update = connection.prepare(`UPDATE chat_board SET unread = ?, observed_at = ?, inbound_id = ?,
      stage = CASE WHEN ? THEN 'new' ELSE stage END,
      position = CASE WHEN ? THEN 0 ELSE position END,
      revision = revision + CASE WHEN ? THEN 1 ELSE 0 END WHERE chat_id = ?`);
    for (const chat of chats) {
      const previous = read.get(chat.id) as { unread: number; observed_at: string; inbound_id: string } | undefined;
      const incoming = incomingIds.get(chat.id) ?? previous?.inbound_id ?? "";
      if (!previous) { insert.run(chat.id, chat.unread_count, chat.last_message_at, incoming); continue; }
      if (chat.last_message_at < previous.observed_at) continue;
      const received = chat.unread_count > previous.unread || (chat.unread_count > 0
        && /^\d+$/.test(incoming) && /^\d+$/.test(previous.inbound_id) && BigInt(incoming) > BigInt(previous.inbound_id));
      update.run(chat.unread_count, chat.last_message_at, incoming, Number(received), Number(received), Number(received), chat.id);
    }
  })();
}

export function getBoardState(chatId: string): BoardState {
  return db().prepare("SELECT stage, revision, position FROM chat_board WHERE chat_id = ?").get(chatId) as BoardState
    ?? { stage: "new", revision: 0, position: 0 };
}

export function moveBoardChat(chatId: string, stage: BoardStage, revision: number, order?: BoardOrderEntry[]) {
  const connection = db();
  return connection.transaction(() => {
    const current = getBoardState(chatId);
    if (current.revision !== revision || order?.some((entry) => {
      const state = getBoardState(entry.id);
      return state.revision !== entry.revision || (entry.id !== chatId && state.stage !== stage);
    })) return { ok: false, state: current };
    const insert = connection.prepare("INSERT OR IGNORE INTO chat_board(chat_id) VALUES (?)");
    insert.run(chatId);
    if (order) {
      const states: Record<string, BoardState> = {};
      const update = connection.prepare("UPDATE chat_board SET stage = ?, position = ?, revision = revision + 1 WHERE chat_id = ?");
      order.forEach((entry, index) => {
        insert.run(entry.id);
        update.run(stage, index + 1, entry.id);
        states[entry.id] = getBoardState(entry.id);
      });
      return { ok: true, state: states[chatId], states };
    }
    const result = connection.prepare("UPDATE chat_board SET stage = ?, position = 0, revision = revision + 1 WHERE chat_id = ? AND revision = ?")
      .run(stage, chatId, revision);
    return { ok: result.changes === 1, state: getBoardState(chatId) };
  })();
}
