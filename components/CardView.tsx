"use client";

// 카드 뷰 — 세로 스크롤 그리드 레이아웃
import type { Chat } from "@/lib/types";
import { ClientCard } from "./ClientCard";
import { ViewSwitcher } from "./ViewSwitcher";

interface Props {
  chats: Chat[];
  onSwitchToInbox: (chatId?: string) => void;
  onSwitchToBoard: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export function CardView({
  chats,
  onSwitchToInbox,
  onSwitchToBoard,
  onOpenSettings,
  onNewChat,
  refreshing,
  onRefresh,
}: Props) {
  // 고객 카테고리만 표시
  const filtered = [...chats]
    .filter((c) => c.category === "client")
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  return (
    <div className="flex flex-col h-screen bg-[#F5F6F8] overflow-hidden">
      {/* 상단 바 — 다른 뷰와 동일 아이콘/순서 */}
      <div className="px-3 py-3 bg-white border-b border-[#D6D8DF] flex items-center gap-2 md:gap-3 shrink-0">
        <span className="text-base md:text-sm font-bold text-[#1A1F36] shrink-0">카카오톡 인박스</span>
        <span className="text-sm md:text-xs px-2.5 py-1 rounded bg-[#2959AA] text-white">고객</span>
        <span className="hidden md:inline text-[10px] text-[#9CA3AF]">{filtered.length}개</span>

        <div className="ml-auto flex items-center gap-0.5 md:gap-1.5">
          {/* 1. 새 대화 추가 */}
          <button
            onClick={onNewChat}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
            title="새 대화 추가"
            aria-label="새 대화 추가"
          >
            <svg className="w-6 h-6 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {/* 2. 뷰 전환 드롭다운 */}
          <ViewSwitcher
            current="card"
            onChange={(v) => {
              if (v === "inbox") onSwitchToInbox();
              else if (v === "board") onSwitchToBoard();
            }}
          />
          {/* 3. 새로고침 */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] disabled:text-[#9CA3AF] transition-colors"
            title="새로고침"
            aria-label="새로고침"
          >
            <svg
              className={`w-6 h-6 md:w-4 md:h-4 ${refreshing ? "animate-spin text-[#2959AA]" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* 4. 설정 */}
          <button
            onClick={onOpenSettings}
            className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
            title="설정"
            aria-label="설정"
          >
            <svg className="w-6 h-6 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 카드 그리드 — 세로 스크롤 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-[#9CA3AF]">
            고객 카테고리 채팅방이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 items-start">
            {filtered.map((c) => (
              <ClientCard
                key={c.id}
                chat={c}
                onOpenInbox={() => onSwitchToInbox(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
