"use client";

// 보드 뷰 — 가로 스크롤 카드 레이아웃
import { useEffect, useRef, useState } from "react";
import type { Category, Chat } from "@/lib/types";

interface Props {
  chats: Chat[];
  filter: "all" | "client" | "casual";
  onFilterChange: (f: "all" | "client" | "casual") => void;
  onCategoryChange: (chatId: string, category: Category | null) => void;
  onSwitchToInbox: (chatId?: string) => void;
  onOpenSettings: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

const CATEGORY_STYLES: Record<Category, string> = {
  client: "bg-[#2959AA] text-white",
  casual: "bg-[#16A34A] text-white",
  bot:    "bg-[#6B7280] text-white",
};
const CATEGORY_LABELS: Record<Category, string> = {
  client: "고객", casual: "잡담", bot: "봇",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
      : `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return ""; }
}

// 카드별 메모 관리
function MemoCard({
  chat,
  onOpenInbox,
}: {
  chat: Chat;
  onOpenInbox: () => void;
}) {
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/memo?chatId=${encodeURIComponent(chat.id)}`)
      .then((r) => r.json())
      .then((d: { content: string }) => setMemo(d.content ?? ""))
      .catch(() => {});
  }, [chat.id]);

  function handleChange(val: string) {
    setMemo(val);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, content: val }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 1000);
  }

  const name = (!chat.display_name || chat.display_name === "(unknown)")
    ? `(멤버 ${chat.member_count}명)`
    : chat.display_name;

  return (
    <div className="flex flex-col h-full w-56 shrink-0 bg-white border border-[#D6D8DF] rounded-lg overflow-hidden shadow-sm">
      {/* 카드 헤더 */}
      <div className="px-3 pt-3 pb-2 border-b border-[#E8E9EC]">
        <button
          onClick={onOpenInbox}
          className="w-full text-left group"
          title="인박스에서 열기"
        >
          <div className="flex items-start justify-between gap-1 mb-1.5">
            <span className="text-sm font-semibold text-[#1A1F36] leading-tight line-clamp-2 group-hover:text-[#2959AA] transition-colors">
              {name}
            </span>
            {chat.unread_count > 0 && (
              <span className="shrink-0 text-[9px] bg-red-500 text-white rounded-full px-1.5 py-0.5 mt-0.5">
                {chat.unread_count > 99 ? "99+" : chat.unread_count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {chat.category && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_STYLES[chat.category]}`}>
                {CATEGORY_LABELS[chat.category]}
              </span>
            )}
            <span className="text-[9px] text-[#9CA3AF]">👥 {chat.member_count}</span>
            <span className="text-[9px] text-[#9CA3AF] ml-auto">{formatTime(chat.last_message_at)}</span>
          </div>
        </button>
      </div>

      {/* 메모 영역 */}
      <div className="flex-1 flex flex-col p-2 min-h-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-[#9CA3AF]">메모</span>
          {saved && <span className="text-[9px] text-green-500">저장됨</span>}
        </div>
        <textarea
          value={memo}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="메모 없음"
          className="flex-1 w-full text-xs text-[#1A1F36] bg-[#F5F6F8] rounded p-1.5 resize-none focus:outline-none focus:bg-white focus:border focus:border-[#2959AA] placeholder-[#C8CAD1] leading-[1.5] min-h-[80px]"
        />
      </div>
    </div>
  );
}

export function BoardView({
  chats,
  filter,
  onFilterChange,
  onSwitchToInbox,
  onOpenSettings,
  refreshing,
  onRefresh,
}: Props) {
  const filtered = [...chats]
    .filter((c) => filter === "all" || c.category === filter)
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  return (
    <div className="flex flex-col h-screen bg-[#F5F6F8] overflow-hidden">
      {/* 상단 바 */}
      <div className="px-4 py-3 bg-white border-b border-[#D6D8DF] flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-[#1A1F36]">카카오 인박스</span>

        {/* 필터 */}
        <div className="flex gap-1 text-xs">
          {(["all", "client", "casual"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`px-2.5 py-1 rounded transition-colors ${
                filter === f
                  ? "bg-[#2959AA] text-white"
                  : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
              }`}
            >
              {f === "all" ? "전체" : f === "client" ? "고객" : "잡담"}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-[#9CA3AF]">{filtered.length}개</span>

        <div className="ml-auto flex items-center gap-2">
          {/* 새로고침 */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-[#6B7280] hover:text-[#1A1F36] disabled:text-[#9CA3AF] transition-colors"
            title="새로고침"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin text-[#2959AA]" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* 설정 */}
          <button
            onClick={onOpenSettings}
            className="text-[#6B7280] hover:text-[#1A1F36] transition-colors"
            title="설정"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* 인박스 뷰 전환 */}
          <button
            onClick={() => onSwitchToInbox()}
            className="text-[10px] px-2.5 py-1 bg-[#E8E9EC] hover:bg-[#D6D8DF] text-[#1A1F36] rounded transition-colors"
          >
            인박스 뷰
          </button>
        </div>
      </div>

      {/* 카드 가로 스크롤 영역 */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full px-4 py-4 w-max">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center w-64 text-sm text-[#9CA3AF]">
              채팅방이 없습니다
            </div>
          ) : (
            filtered.map((c) => (
              <MemoCard
                key={c.id}
                chat={c}
                onOpenInbox={() => onSwitchToInbox(c.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
