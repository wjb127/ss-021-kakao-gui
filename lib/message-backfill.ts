import { listMessages } from "./kakaocli";
import { upsertMessages } from "./store";

// 처음 연 방의 과거 보충은 한 번에 한 방만 실행한다.
const state = globalThis as typeof globalThis & {
  __messageBackfill?: { tail: Promise<void>; pending: Map<string, Promise<void>> };
};
const queue = state.__messageBackfill ??= { tail: Promise.resolve(), pending: new Map() };

export function isBackfillPending(chatId: string): boolean {
  return queue.pending.has(chatId);
}

export function backfillMessages(chatId: string): Promise<void> {
  const pending = queue.pending.get(chatId);
  if (pending) return pending;
  const task = queue.tail.then(async () => {
    // 기존 최초 조회 범위를 유지하되 최근 대화 응답 뒤로 미룬다.
    const messages = await listMessages(chatId, "50d", 5000);
    upsertMessages(messages);
  }).finally(() => { queue.pending.delete(chatId); });
  queue.pending.set(chatId, task);
  queue.tail = task.catch(() => { /* 한 방의 실패가 다음 방을 막지 않는다. */ });
  return task;
}
