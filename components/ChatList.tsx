"use client";

// 채팅 목록 사이드바
import { useMemo, useEffect, useRef, useState } from "react";
import type { Category, Chat } from "@/lib/types";
import { ViewSwitcher } from "./ViewSwitcher";

interface Props {
  chats: Chat[];
  selectedChatId: string | null;
  onSelect: (id: string) => void;
  filter: "all" | "client" | "casual";
  onFilterChange: (f: "all" | "client" | "casual") => void;
  onCategoryChange: (chatId: string, category: Category | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSwitchToBoard: () => void;
  onSwitchToCard: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
}

// 카테고리 배지 스타일 — 10% 포인트 컬러 기반
const CATEGORY_STYLES: Record<Category, string> = {
  bot:    "bg-[#6B7280] text-white",
  client: "bg-[#2959AA] text-white",
  casual: "bg-[#16A34A] text-white",
};

const CATEGORY_LABELS: Record<Category, string> = {
  bot: "봇",
  client: "고객",
  casual: "잡담",
};

const OPTIONS: { value: Category | null; label: string; style: string }[] = [
  { value: null,     label: "— 없음", style: "text-[#6B7280] hover:bg-[#E8E9EC]" },
  { value: "client", label: "고객",   style: "text-[#2959AA] hover:bg-[#E8E9EC]" },
  { value: "casual", label: "잡담",   style: "text-[#16A34A] hover:bg-[#E8E9EC]" },
  { value: "bot",    label: "봇",     style: "text-[#6B7280] hover:bg-[#E8E9EC]" },
];

function CategoryDropdown({
  category,
  onSelect,
  onOpenChange,
}: {
  category: Category | null;
  onSelect: (c: Category | null) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function setOpen(v: boolean | ((p: boolean) => boolean)) {
    setOpenState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      onOpenChange?.(next);
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
          category
            ? CATEGORY_STYLES[category]
            : "bg-[#E8E9EC] text-[#6B7280] border border-[#D6D8DF] hover:border-[#9CA3AF]"
        }`}
      >
        {category ? CATEGORY_LABELS[category] : "—"}
      </button>

      {/* 드롭다운 메뉴 — 흰 배경, 라이트 보더 */}
      {open && (
        <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-[#D6D8DF] rounded shadow-md py-0.5 min-w-[64px]">
          {OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left text-[11px] px-3 py-1.5 ${opt.style} ${
                category === opt.value ? "font-bold" : ""
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}

// 카테고리 → 원형 색상 (접힌 상태용)
const CATEGORY_DOT: Record<Category, string> = {
  client: "bg-[#2959AA]",
  casual: "bg-[#16A34A]",
  bot:    "bg-[#6B7280]",
};

// 채팅 행 — 모바일 좌측 스와이프 시 빨간 삭제 버튼 노출 (manual_* 전용)
function ChatRow({
  chat,
  isSelected,
  onSelect,
  onCategoryChange,
  onDeleteChat,
}: {
  chat: Chat;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCategoryChange: (chatId: string, category: Category | null) => void;
  onDeleteChat: (chatId: string) => void;
}) {
  const isManual = chat.id.startsWith("manual_");
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [catOpen, setCatOpen] = useState(false); // 카테고리 드롭다운 열림 상태 (z-index 보정용)
  const startX = useRef(0);
  const startY = useRef(0);
  const horizontal = useRef(false);
  const REVEAL = 80;

  function handleTouchStart(e: React.TouchEvent) {
    if (!isManual) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    horizontal.current = false;
    setDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isManual || !dragging) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    // 첫 이동에서 가로 의도 판단 (세로 스크롤 방해 방지)
    if (!horizontal.current) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        horizontal.current = true;
      } else if (Math.abs(dy) > 6) {
        setDragging(false);
        return;
      } else {
        return;
      }
    }
    // 이미 열린 상태에서 추가 좌측 드래그/우측 닫기 보정
    const base = offset;
    const next = Math.max(-REVEAL, Math.min(0, base + dx));
    setOffset(next);
  }

  function handleTouchEnd() {
    if (!isManual) return;
    setDragging(false);
    if (!horizontal.current) return;
    setOffset((prev) => (prev < -REVEAL / 2 ? -REVEAL : 0));
  }

  // manual 전용 파스텔 배경 (peach 계열)
  const manualBg = isSelected
    ? "bg-[#FFE3C2] border-l-2 border-l-[#F59E0B]"
    : "bg-[#FFF4E5] hover:bg-[#FCE7C8]";
  const normalBg = isSelected
    ? "bg-[#E8ECF5] border-l-2 border-l-[#2959AA]"
    : "hover:bg-[#E0E2E8]";

  return (
    <div className={`relative border-b border-[#C8CAD1] ${catOpen ? "z-30" : ""}`}>
      {/* 좌측 스와이프 시 노출되는 삭제 버튼 (manual_* 전용) */}
      {isManual && (
        <button
          onClick={() => {
            onDeleteChat(chat.id);
            setOffset(0);
          }}
          className="absolute right-0 top-0 bottom-0 w-20 bg-red-500 hover:bg-red-600 text-white text-xs font-medium flex items-center justify-center"
          style={{ opacity: offset < -8 ? 1 : 0, pointerEvents: offset < -8 ? "auto" : "none" }}
          aria-label="대화 삭제"
        >
          삭제
        </button>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          // 열려있으면 클릭으로 닫기 우선
          if (offset < 0) {
            setOffset(0);
            return;
          }
          onSelect(chat.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(chat.id);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.2s",
        }}
        className={`relative w-full text-left px-3 py-2 cursor-pointer min-w-0 ${
          isManual ? manualBg : normalBg
        }`}
      >
        <div className="flex items-center gap-2 mb-1 min-w-0">
          <CategoryDropdown
            category={chat.category}
            onSelect={(cat) => onCategoryChange(chat.id, cat)}
            onOpenChange={setCatOpen}
          />
          <span className="text-sm text-[#1A1F36] truncate flex-1 min-w-0">
            {(!chat.display_name || chat.display_name === "(unknown)")
              ? `(멤버 ${chat.member_count}명)`
              : chat.display_name}
          </span>
          {chat.unread_count > 0 && (
            <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 shrink-0">
              {chat.unread_count > 999 ? "999+" : chat.unread_count}
            </span>
          )}
          {isManual && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
              className="hidden md:inline text-[10px] text-[#9CA3AF] hover:text-red-500 transition-colors shrink-0"
              title="대화 삭제"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
          <span>👥 {chat.member_count}</span>
          <span>{formatTime(chat.last_message_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatList({
  chats,
  selectedChatId,
  onSelect,
  filter,
  onFilterChange,
  onCategoryChange,
  onRefresh,
  refreshing,
  collapsed,
  onToggleCollapse,
  onSwitchToBoard,
  onSwitchToCard,
  onOpenSettings,
  onNewChat,
  onDeleteChat,
}: Props) {
  const filtered = useMemo(() => {
    const list =
      filter === "all"
        ? chats
        : chats.filter((c) => c.category === filter);
    return [...list].sort((a, b) =>
      b.last_message_at.localeCompare(a.last_message_at),
    );
  }, [chats, filter]);

  // ── 접힌 상태 ──────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex flex-col h-full w-full bg-[#D6D8DF] border-r border-[#D6D8DF] items-center">
        {/* 펼치기 버튼 */}
        <button
          onClick={onToggleCollapse}
          className="w-full py-3 flex justify-center text-[#6B7280] hover:text-[#1A1F36] hover:bg-[#C8CAD1] transition-colors"
          title="목록 펼치기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1 overflow-y-auto w-full">
          {filtered.map((c) => {
            const isSelected = selectedChatId === c.id;
            const isManual = c.id.startsWith("manual_");
            const cls = isManual
              ? isSelected ? "bg-[#FFE3C2]" : "bg-[#FFF4E5] hover:bg-[#FCE7C8]"
              : isSelected ? "bg-[#E8ECF5]" : "hover:bg-[#C8CAD1]";
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                title={c.display_name || `멤버 ${c.member_count}명`}
                className={`w-full py-2 flex justify-center relative transition-colors ${cls}`}
              >
                {/* 카테고리 점 */}
                <span className={`w-2.5 h-2.5 rounded-full ${
                  c.category ? CATEGORY_DOT[c.category] : "bg-[#9CA3AF]"
                }`} />
                {/* 미읽음 */}
                {c.unread_count > 0 && (
                  <span className="absolute top-1 right-1 text-[8px] bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {c.unread_count > 9 ? "9+" : c.unread_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    /* 사이드바: 60% 배경 #D6D8DF */
    <div className="flex flex-col h-full w-full min-w-0 bg-[#D6D8DF] border-r border-[#D6D8DF]">
      {/* 헤더 영역: 30% 흰 패널 */}
      <div className="p-3 border-b border-[#D6D8DF] bg-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-base md:text-sm font-bold text-[#1A1F36]">카카오톡 인박스</h1>
          <div className="flex items-center gap-0.5 md:gap-1.5">
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
              current="inbox"
              onChange={(v) => {
                if (v === "card") onSwitchToCard();
                else if (v === "board") onSwitchToBoard();
              }}
            />
            {/* 3. 새로고침 */}
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] disabled:text-[#9CA3AF] transition-colors"
              title="채팅 목록 새로고침"
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
            {/* 5. 접기 — 데스크탑 전용 보조 */}
            <button
              onClick={onToggleCollapse}
              className="hidden md:inline-flex p-2 md:p-0 text-[#6B7280] hover:text-[#1A1F36] transition-colors"
              title="목록 접기"
              aria-label="목록 접기"
            >
              <svg className="w-6 h-6 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>
        {/* 필터 탭 */}
        <div className="flex gap-1 text-sm md:text-xs">
          {(["all", "client", "casual"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`flex-1 py-2 md:py-1 rounded transition-colors ${
                filter === f
                  ? "bg-[#2959AA] text-white"
                  : "bg-[#E8E9EC] text-[#1A1F36] hover:bg-[#D6D8DF]"
              }`}
            >
              {f === "all" ? "전체" : f === "client" ? "고객" : "잡담"}
            </button>
          ))}
        </div>
      </div>

      {/* 채팅 목록 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-xs text-[#6B7280] p-4 text-center">
            채팅이 없습니다
          </div>
        ) : (
          filtered.map((c) => (
            <ChatRow
              key={c.id}
              chat={c}
              isSelected={selectedChatId === c.id}
              onSelect={onSelect}
              onCategoryChange={onCategoryChange}
              onDeleteChat={onDeleteChat}
            />
          ))
        )}
      </div>
    </div>
  );
}
