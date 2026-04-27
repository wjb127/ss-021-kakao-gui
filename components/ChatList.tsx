"use client";

// 채팅 목록 사이드바
import { useMemo, useEffect, useRef, useState } from "react";
import type { Category, Chat } from "@/lib/types";

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
}: {
  category: Category | null;
  onSelect: (c: Category | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
      <div className="flex flex-col h-full bg-[#D6D8DF] border-r border-[#D6D8DF] items-center">
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
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                title={c.display_name || `멤버 ${c.member_count}명`}
                className={`w-full py-2 flex justify-center relative transition-colors ${
                  isSelected ? "bg-[#E8ECF5]" : "hover:bg-[#C8CAD1]"
                }`}
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
    <div className="flex flex-col h-full bg-[#D6D8DF] border-r border-[#D6D8DF]">
      {/* 헤더 영역: 30% 흰 패널 */}
      <div className="p-3 border-b border-[#D6D8DF] bg-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-sm font-bold text-[#1A1F36]">카카오톡 인박스</h1>
          <div className="flex items-center gap-1.5">
            {/* 접기 버튼 */}
            <button
              onClick={onToggleCollapse}
              className="text-[#6B7280] hover:text-[#1A1F36] transition-colors"
              title="목록 접기"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="text-[#6B7280] hover:text-[#1A1F36] disabled:text-[#9CA3AF] transition-colors"
              title="채팅 목록 새로고침"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? "animate-spin text-[#2959AA]" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
        {/* 필터 탭 */}
        <div className="flex gap-1 text-xs">
          {(["all", "client", "casual"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`flex-1 py-1 rounded transition-colors ${
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
          filtered.map((c) => {
            const isSelected = selectedChatId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-3 py-2 border-b border-[#C8CAD1] transition-colors ${
                  isSelected
                    ? "bg-[#E8ECF5] border-l-2 border-l-[#2959AA]"
                    : "hover:bg-[#E0E2E8]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CategoryDropdown
                    category={c.category}
                    onSelect={(cat) => onCategoryChange(c.id, cat)}
                  />
                  <span className="text-sm text-[#1A1F36] truncate flex-1">
                    {(!c.display_name || c.display_name === "(unknown)")
                      ? `(멤버 ${c.member_count}명)`
                      : c.display_name}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 shrink-0">
                      {c.unread_count > 999 ? "999+" : c.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
                  <span>👥 {c.member_count}</span>
                  <span>{formatTime(c.last_message_at)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
