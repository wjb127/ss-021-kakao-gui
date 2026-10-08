import type { Chat } from "./types";

// 값이 같은 행은 참조도 유지해 갱신 때 전체 목록이 다시 렌더링되지 않게 한다.
export function reconcileChats(previous: Chat[], incoming: Chat[]): Chat[] {
  const byId = new Map(previous.map((chat) => [chat.id, chat]));
  const next = incoming.map((chat) => {
    const old = byId.get(chat.id);
    return old && JSON.stringify(old) === JSON.stringify(chat) ? old : chat;
  });
  return next.length === previous.length && next.every((chat, index) => chat === previous[index]) ? previous : next;
}
