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
}

const CATEGORY_STYLES: Record<Category, string> = {
  bot: "bg-gray-600 text-gray-100",
  client: "bg-blue-600 text-white",
  casual: "bg-green-600 text-white",
};

const CATEGORY_LABELS: Record<Category, string> = {
  bot: "봇",
  client: "고객",
  casual: "잡담",
};

const OPTIONS: { value: Category | null; label: string; style: string }[] = [
  { value: null,     label: "— 없음", style: "text-gray-400 hover:bg-gray-700" },
  { value: "client", label: "고객",   style: "text-blue-400 hover:bg-gray-700" },
  { value: "casual", label: "잡담",   style: "text-green-400 hover:bg-gray-700" },
  { value: "bot",    label: "봇",     style: "text-gray-400 hover:bg-gray-700" },
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
            : "bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500"
        }`}
      >
        {category ? CATEGORY_LABELS[category] : "—"}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-0.5 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-0.5 min-w-[64px]">
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

export function ChatList({
  chats,
  selectedChatId,
  onSelect,
  filter,
  onFilterChange,
  onCategoryChange,
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

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800">
      <div className="p-3 border-b border-gray-800">
        <h1 className="text-sm font-bold text-gray-200 mb-2">카카오톡 인박스</h1>
        <div className="flex gap-1 text-xs">
          {(["all", "client", "casual"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`flex-1 py-1 rounded ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f === "all" ? "전체" : f === "client" ? "고객" : "잡담"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-xs text-gray-500 p-4 text-center">
            채팅이 없습니다
          </div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full text-left px-3 py-2 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                selectedChatId === c.id ? "bg-gray-800" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <CategoryDropdown
                  category={c.category}
                  onSelect={(cat) => onCategoryChange(c.id, cat)}
                />
                <span className="text-sm text-gray-100 truncate flex-1">
                  {(!c.display_name || c.display_name === "(unknown)")
                    ? `(멤버 ${c.member_count}명)`
                    : c.display_name}
                </span>
                {c.unread_count > 0 && (
                  <span className="text-[10px] bg-red-600 text-white rounded-full px-1.5 py-0.5 shrink-0">
                    {c.unread_count > 999 ? "999+" : c.unread_count}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>👥 {c.member_count}</span>
                <span>{formatTime(c.last_message_at)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
