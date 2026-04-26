"use client";

// 채팅 목록 사이드바
import { useMemo } from "react";
import type { Category, Chat } from "@/lib/types";

interface Props {
  chats: Chat[];
  selectedChatId: string | null;
  onSelect: (id: string) => void;
  filter: "all" | "client" | "casual";
  onFilterChange: (f: "all" | "client" | "casual") => void;
  onCategoryChange: (chatId: string, category: Category | null) => void;
}

// 카테고리 사이클: none -> bot -> casual -> client -> none
const CYCLE: (Category | null)[] = [null, "bot", "casual", "client"];

function nextCategory(current: Category | null): Category | null {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length];
}

function CategoryBadge({
  category,
  onClick,
}: {
  category: Category | null;
  onClick: (e: React.MouseEvent) => void;
}) {
  const styles: Record<Category, string> = {
    bot: "bg-gray-600 text-gray-100",
    client: "bg-blue-600 text-white",
    casual: "bg-green-600 text-white",
  };
  const labels: Record<Category, string> = {
    bot: "봇",
    client: "고객",
    casual: "잡담",
  };
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 transition-colors ${
        category
          ? styles[category]
          : "bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500"
      }`}
      title="클릭해서 카테고리 변경"
    >
      {category ? labels[category] : "—"}
    </button>
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
                <CategoryBadge
                  category={c.category}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCategoryChange(c.id, nextCategory(c.category));
                  }}
                />
                <span className="text-sm text-gray-100 truncate flex-1">
                  {c.display_name || "(이름 없음)"}
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
